module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const { sessionId } = req.body;

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    // Vérifier que le paiement est bien confirmé
    if (session.payment_status !== 'paid') {
      return res.status(200).json({ sent: false, reason: 'not paid' });
    }

    const customerEmail = session.customer_details?.email;
    const apartment = session.metadata?.apartment;
    const slot = session.metadata?.slot;

    const lineItemsData = await stripe.checkout.sessions.listLineItems(sessionId);
    const items = lineItemsData.data;
    const total = (session.amount_total / 100).toFixed(2).replace('.', ',');

    const lignesTexte = items.map(i =>
      `• ${i.quantity} × ${i.description} — ${((i.price.unit_amount * i.quantity)/100).toFixed(2).replace('.', ',')} €`
    ).join('\n');

    const lignesHTML = items.map(i =>
      `<tr><td style="padding:8px 0;color:#5c3d1e;font-size:14px;">${i.quantity} × ${i.description}</td><td style="padding:8px 0;color:#5c3d1e;font-size:14px;text-align:right;">${((i.price.unit_amount * i.quantity)/100).toFixed(2).replace('.', ',')} €</td></tr>`
    ).join('');

    // Email de notification à Hervé
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Viennoiseries <onboarding@resend.dev>',
        to: ['h.mainguet@le-regent.fr'],
        subject: `🥐 Nouvelle commande — ${apartment} — ${slot}`,
        text: `Nouvelle commande reçue !\n\nAppartement : ${apartment}\nHeure de livraison : ${slot}\n\nDétail :\n${lignesTexte}\n\nTotal : ${total} €\n\n---\nViennoiseries toutes chaudes — Maison Régent`,
      }),
    });

    // Email reçu au client si email disponible
    if (customerEmail) {
      const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f0eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:480px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:#6B4F30;padding:32px 28px;text-align:center;">
      <div style="font-size:36px;margin-bottom:8px;">🥐</div>
      <h1 style="color:#fff;font-size:20px;font-weight:600;margin:0 0 6px;">Votre commande est confirmée !</h1>
      <p style="color:rgba(255,255,255,0.75);font-size:13px;margin:0;">Maison Régent · Pornichet</p>
    </div>
    <div style="padding:28px;">
      <p style="color:#5c3d1e;font-size:15px;margin:0 0 20px;">Bonjour,</p>
      <p style="color:#5c3d1e;font-size:15px;margin:0 0 24px;">Merci pour votre commande ! Vos viennoiseries toutes chaudes seront livrées demain matin à votre porte.</p>
      <div style="background:#faf8f5;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="font-size:12px;color:#999;text-transform:uppercase;letter-spacing:0.08em;padding-bottom:6px;">Appartement</td>
            <td style="font-size:14px;color:#5c3d1e;font-weight:500;text-align:right;padding-bottom:6px;">${apartment}</td>
          </tr>
          <tr>
            <td style="font-size:12px;color:#999;text-transform:uppercase;letter-spacing:0.08em;">Heure de livraison</td>
            <td style="font-size:14px;color:#5c3d1e;font-weight:500;text-align:right;">${slot}</td>
          </tr>
        </table>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
        <tr><td colspan="2" style="padding-bottom:8px;font-size:12px;color:#999;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #ede8e0;">Détail de la commande</td></tr>
        ${lignesHTML}
        <tr style="border-top:1px solid #ede8e0;">
          <td style="padding-top:12px;font-size:15px;font-weight:600;color:#2c1a0e;">Total</td>
          <td style="padding-top:12px;font-size:15px;font-weight:600;color:#6B4F30;text-align:right;">${total} €</td>
        </tr>
      </table>
      <p style="color:#aaa;font-size:12px;margin:24px 0 0;text-align:center;">Beurre AOP Charentes-Poitou · Artisanal</p>
      <p style="color:#aaa;font-size:12px;margin:6px 0 0;text-align:center;">Viennoiseries toutes chaudes — Maison Régent</p>
    </div>
  </div>
</body>
</html>`;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Maison Régent <onboarding@resend.dev>',
          to: [customerEmail],
          subject: '🥐 Votre commande de viennoiseries — Maison Régent',
          html,
        }),
      });
    }

    res.status(200).json({ sent: true, to: customerEmail || 'no client email' });

  } catch (err) {
    console.error('Receipt error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
