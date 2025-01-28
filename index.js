const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
require('dotenv').config(); // Načtení proměnných prostředí

const app = express();

// ✅ Funkce pro odstranění diakritiky
const removeDiacritics = (text) => {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

// ✅ Logování SMTP konfigurace (pro ladění)
console.log("✅ SMTP Nastavení:");
console.log("SMTP_HOST:", process.env.SMTP_HOST || "❌ NENÍ NASTAVENO");
console.log("SMTP_PORT:", process.env.SMTP_PORT || "❌ NENÍ NASTAVENO");
console.log("SMTP_USER:", process.env.SMTP_USER || "❌ NENÍ NASTAVENO");
console.log("SMTP_PASS:", process.env.SMTP_PASS ? "✔ [skryto]" : "❌ NENÍ NASTAVENO");

// ✅ Povolení CORS
app.use(cors());

// ✅ Zvýšení limitu pro velikost požadavků
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// ✅ Obsluha statických souborů
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Testovací route
app.get('/', (req, res) => {
  res.send('✅ Server běží správně!');
});

// ✅ Route pro zpracování kontaktního formuláře
app.post('/contact', async (req, res) => {
  console.log('📩 Přijatá data z kontaktního formuláře:', req.body);

  const { name, email, subject, message } = req.body;

  // ✅ Kontrola povinných polí
  if (!name || !email || !message) {
    console.error('❌ Chybí povinná pole (name, email, nebo message).');
    return res.status(400).json({
      success: false,
      error: 'Chybí povinná pole (name, email, nebo message).',
    });
  }

  try {
    // ✅ Ověření SMTP konfigurace
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.error('❌ Chybí SMTP konfigurace!');
      return res.status(500).json({ success: false, error: 'Chybí SMTP konfigurace!' });
    }

    // ✅ Nastavení Nodemailer transportu
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: parseInt(process.env.SMTP_PORT, 10) === 465, // True pokud používáte SSL
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // ✅ Odeslání e-mailu
    const mailOptions = {
      from: email, // E-mail klienta
      to: process.env.SMTP_USER, // Administrátorův e-mail
      subject: subject || 'Nová zpráva z kontaktního formuláře',
      text: `Jméno: ${removeDiacritics(name)}\nE-mail: ${email}\n\nZpráva:\n${removeDiacritics(message)}`,
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Zpráva byla úspěšně odeslána.');

    res.status(200).json({ success: true, message: 'Zpráva byla úspěšně odeslána.' });
  } catch (error) {
    console.error('❌ Chyba při odesílání e-mailu:', error);
    res.status(500).json({ success: false, error: 'Došlo k chybě při odesílání zprávy.' });
  }
});

// ✅ Route pro generování PDF (původní část kódu)
app.post('/api/generate-pdf', async (req, res) => {
  // Tento kód zůstává beze změny (viz původní kód)
  // ... celý kód pro generování PDF a odeslání e-mailu
});

// ✅ Spuštění serveru
const PORT = process.env.PORT || 1337;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server běží na portu: ${PORT}`);
});