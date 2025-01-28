const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
require('dotenv').config(); // Načtení proměnných prostředí

const app = express();

// ✅ Povolení CORS
app.use(cors());

// ✅ Přesměrování HTTP na HTTPS (pouze na Heroku)
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// ✅ Zvýšení limitu pro velikost požadavků
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// ✅ Obsluha statických souborů
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Testovací route
app.get('/', (req, res) => {
  res.send('✅ Server běží správně!');
});

// ✅ Route pro generování PDF
app.post('/api/generate-pdf', async (req, res) => {
  console.log('📩 Přijatý požadavek:', req.body);

  const {
    email,
    name,
    age,
    gender,
    height,
    weight,
    targetWeight,
    dietHistory,
    foodPreferences,
    restrictions,
    goals,
    notes,
    paymentMethod,
  } = req.body;

  // Kontrola povinných polí
  const missingFields = [];
  if (!email) missingFields.push('email');
  if (!name) missingFields.push('name');
  if (!age) missingFields.push('age');
  if (!height) missingFields.push('height');
  if (!weight) missingFields.push('weight');
  if (!targetWeight) missingFields.push('targetWeight');
  if (!paymentMethod) missingFields.push('paymentMethod');

  if (missingFields.length > 0) {
    console.error('❌ Chybí povinná pole:', missingFields.join(', '));
    return res.status(400).json({
      success: false,
      error: `Chybí povinná pole: ${missingFields.join(', ')}`,
    });
  }

  const pdfPath = path.join(__dirname, `form_output_${Date.now()}.pdf`);

  try {
    // Generování PDF
    const doc = new PDFDocument();
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    doc.fontSize(16).text('Bit-Fit: Osobní dotazník', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Jméno: ${name}`);
    doc.text(`E-mail: ${email}`);
    doc.text(`Věk: ${age}`);
    doc.text(`Pohlaví: ${gender}`);
    doc.text(`Výška: ${height} cm`);
    doc.text(`Váha: ${weight} kg`);
    doc.text(`Cílová váha: ${targetWeight} kg`);
    doc.text(`Historie diet: ${dietHistory || 'Neuvedeno'}`);
    doc.text(`Oblíbené potraviny: ${foodPreferences || 'Neuvedeno'}`);
    doc.text(`Neoblíbené potraviny: ${restrictions || 'Neuvedeno'}`);
    doc.text(`Cíle: ${goals || 'Neuvedeno'}`);
    doc.text(`Poznámky: ${notes || 'Neuvedeno'}`);
    doc.moveDown();
    doc.text(`Způsob platby: ${paymentMethod}`);
    doc.text(`Status platby: Zaplaceno`);
    doc.end();

    writeStream.on('finish', async () => {
      try {
        // Nastavení Nodemailer transportu
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT, 10),
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        // Email administrátora
        const adminMailOptions = {
          from: process.env.SMTP_USER,
          to: process.env.SMTP_USER,
          subject: 'Nový dotazník - Bit-Fit',
          text: '📎 V příloze naleznete nový vyplněný dotazník.',
          attachments: [{ filename: 'form_output.pdf', path: pdfPath }],
        };

        // Email klienta
        const clientMailOptions = {
          from: process.env.SMTP_USER,
          to: email,
          subject: '✅ Potvrzení přijetí dotazníku - Bit-Fit',
          text: `Dobrý den ${name},\n\nDěkujeme za vyplnění dotazníku. Náš tým začal pracovat na Vašem jídelníčku. Brzy Vás budeme kontaktovat s dalšími informacemi.\n\nS pozdravem,\nTým Bit-Fit`,
        };

        // Odeslání e-mailů
        await Promise.all([
          transporter.sendMail(adminMailOptions),
          transporter.sendMail(clientMailOptions),
        ]);

        res.status(200).json({ success: true, message: '📄 PDF bylo úspěšně vygenerováno a e-maily byly odeslány.' });
      } catch (emailError) {
        console.error('❌ Chyba při odesílání e-mailů:', emailError);
        res.status(500).json({ success: false, error: 'Došlo k chybě při odesílání e-mailů.' });
      } finally {
        fs.unlink(pdfPath, (err) => {
          if (err) console.error('⚠️ Chyba při mazání PDF:', err);
          else console.log('✅ PDF úspěšně odstraněno.');
        });
      }
    });

    writeStream.on('error', (pdfError) => {
      console.error('❌ Chyba při generování PDF:', pdfError);
      res.status(500).json({ success: false, error: 'Došlo k chybě při generování PDF.' });
    });
  } catch (error) {
    console.error('⚠️ Neočekávaná chyba:', error);
    res.status(500).json({ success: false, error: 'Neočekávaná chyba při zpracování objednávky.' });
  }
});

// ✅ Spuštění serveru
const PORT = process.env.PORT || 1337;
app.listen(PORT, () => {
  console.log(`🚀 Server běží na portu: ${PORT}`);
});