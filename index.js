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

// ✅ Logování SMTP konfigurace
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

// ✅ Route pro generování PDF a odesílání e-mailu
app.post('/api/generate-pdf', async (req, res) => {
  console.log('📩 Přijatý požadavek:', req.body);

  const {
    email, name, age, gender, height, weight,
    targetWeight, dietHistory, foodPreferences,
    restrictions, goals, notes, paymentMethod,
    planName = "Nezvoleno",
    planPrice = 0,
    recipePrice = 0,
    totalPrice = 0
  } = req.body;

  const wantsRecipes = recipePrice > 0;

  console.log("🔍 Vybraný plán:", planName);
  console.log("🔍 Cena plánu:", planPrice);
  console.log("🔍 Požaduje recepty:", wantsRecipes);
  console.log("🔍 Cena za recepty:", recipePrice);
  console.log("🔍 Celková cena:", totalPrice);

  // ✅ Kontrola povinných polí
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
    // ✅ Generování PDF
    const doc = new PDFDocument();
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    doc.fontSize(16).text(removeDiacritics('Bit-Fit: Osobni dotaznik'), { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(removeDiacritics(`Jmeno: ${name}`));
    doc.text(removeDiacritics(`E-mail: ${email}`));
    doc.text(removeDiacritics(`Vek: ${age}`));
    doc.text(removeDiacritics(`Pohlavi: ${gender}`));
    doc.text(removeDiacritics(`Vyska: ${height} cm`));
    doc.text(removeDiacritics(`Vaha: ${weight} kg`));
    doc.text(removeDiacritics(`Cilova vaha: ${targetWeight} kg`));
    doc.text(removeDiacritics(`Zpusob platby: ${paymentMethod}`));
    doc.text(removeDiacritics(`Status platby: Zaplaceno`));
    doc.moveDown();
    doc.text(removeDiacritics(`Vybraný plán: ${planName}`));
    doc.text(removeDiacritics(`Cena plánu: ${planPrice} Kč`));
    doc.text(removeDiacritics(`Požaduje recepty: ${wantsRecipes ? 'Ano' : 'Ne'}`));
    doc.text(removeDiacritics(`Cena za recepty: ${recipePrice} Kč`));
    doc.text(removeDiacritics(`Celková cena: ${totalPrice} Kč`));
    doc.end();

    writeStream.on('finish', async () => {
      try {
        // ✅ Ověření SMTP před odesláním
        if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
          throw new Error("❌ Chybí SMTP konfigurace!");
        }

        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT, 10) || 587,
          secure: parseInt(process.env.SMTP_PORT, 10) === 465,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        console.log("📩 Odesílám e-mail administrátorovi...");
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: process.env.SMTP_USER,
          subject: 'Nový dotazník - Bit-Fit',
          text: '📎 V příloze naleznete nový vyplněný dotazník.',
          attachments: [{ filename: 'form_output.pdf', path: pdfPath }],
        });

        console.log("📩 Odesílám e-mail klientovi...");
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: email,
          subject: '✅ Potvrzení přijetí dotazníku - Bit-Fit',
          text: `Dobry den ${name},\n\nDekujeme za vyplneni dotazniku. Nas tym zacal pracovat na Vasem jidelnicku. Brzy Vas budeme kontaktovat.\n\nS pozdravem,\nTym Bit-Fit`,
        });

        console.log("✅ E-maily úspěšně odeslány.");
        res.status(200).json({ success: true, message: '📄 PDF bylo úspěšně vygenerováno a e-maily byly odeslány.' });

        fs.unlinkSync(pdfPath);
        console.log('✅ PDF odstraněno.');
      } catch (emailError) {
        console.error('❌ Chyba při odesílání e-mailů:', emailError);
        res.status(500).json({ success: false, error: 'Chyba při odesílání e-mailů.' });
      }
    });
  } catch (error) {
    console.error('⚠️ Neočekávaná chyba:', error);
    res.status(500).json({ success: false, error: 'Neočekávaná chyba při zpracování objednávky.' });
  }
});

app.listen(process.env.PORT || 1337, () => console.log("🚀 Server běží!"));
