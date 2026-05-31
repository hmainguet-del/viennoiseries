module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const { items, slot, apartment } = req.body;

    if (!items || !slot || !apartment) {
      return res.status(400).json({ error: 'Données manquantes' });
    }

    const lineItems = items.map(item => ({
      price_data: {
        currency: 'eur',
        product_data: {
          name: item.name,
          description: `Livraison ${slot} — ${apartment}`,
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    }));

    const total = items.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2).replace('.', ',');

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${req.headers.origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/`,
      metadata: { apartment, slot },
      payment_intent_data: { metadata: { apartment, slot } },
    });

    // Envoi email de notification via Resend
    const lignes = items.map(i => `• ${i.quantity} × ${i.name} — ${(i.price * i.quantity).toFixed(2).replace('.', ',')} €`).join('\n');

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Viennoiseries <onboarding@resend.dev>',
        to: ['h.mainguet@le-regent.fr'],
        subject: `🥐 Nouvelle commande — ${apartment} — ${slot}`,
        text: `Nouvelle commande reçue !\n\nAppartement : ${apartment}\nHeure de livraison : ${slot}\n\nDétail :\n${lignes}\n\nTotal : ${total} €\n\n---\nViennoiseries toutes chaudes — Maison Régent`,
      }),
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
