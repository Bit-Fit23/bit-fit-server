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

// ✅ Route pro generování PDF a odesílání e-mailu
app.post('/api/generate-pdf', async (req, res) => {
  console.log('📩 Přijatý požadavek:', req.body);

  const {
    email, name, age, gender, height, weight,
    targetWeight, dietHistory, foodPreferences,
    restrictions, goals, notes, paymentMethod,
    planName,  // 👉 frontend posílá `planName`, backend očekával `selectedPlan`
    recipePrice, // 👉 frontend posílá `recipePrice`, backend očekával `wantsRecipes`
    totalPrice  // 👉 frontend posílá `totalPrice`, backend očekával `paymentAmount`
  } = req.body;

  // Přemapování názvů, aby odpovídaly tomu, co očekává backend:
  const selectedPlan = planName; 
  const wantsRecipes = recipePrice > 0; 
  const paymentAmount = totalPrice;

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
    doc.text(removeDiacritics(`Historie diet: ${dietHistory || 'Neuvedeno'}`));
    doc.text(removeDiacritics(`Oblibene potraviny: ${foodPreferences || 'Neuvedeno'}`));
    doc.text(removeDiacritics(`Neoblibene potraviny: ${restrictions || 'Neuvedeno'}`));
    doc.text(removeDiacritics(`Cile: ${goals || 'Neuvedeno'}`));
    doc.text(removeDiacritics(`Poznamky: ${notes || 'Neuvedeno'}`));
    doc.moveDown();
    doc.text(removeDiacritics(`Zpusob platby: ${paymentMethod}`));
    doc.text(removeDiacritics(`Status platby: Zaplaceno`));
    doc.moveDown(); // Přidá mezeru
    doc.text(removeDiacritics(`Vybraný plán: ${selectedPlan}`));
    doc.text(removeDiacritics(`Požaduje recepty: ${wantsRecipes ? 'Ano' : 'Ne'}`));
    doc.text(removeDiacritics(`Výše zaúčtované platby: ${paymentAmount} Kč`));
    doc.end();

    writeStream.on('finish', async () => {
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

        // ✅ Email administrátora
        const adminMailOptions = {
          from: process.env.SMTP_USER,
          to: process.env.SMTP_USER,
          subject: 'Nový dotazník - Bit-Fit',
          text: '📎 V příloze naleznete nový vyplněný dotazník.',
          attachments: [{ filename: 'form_output.pdf', path: pdfPath }],
        };

        // ✅ Email klienta
        const clientMailOptions = {
          from: process.env.SMTP_USER,
          to: email,
          subject: '✅ Potvrzení přijetí dotazníku - Bit-Fit',
          text: `Dobry den ${name},\n\nDekujeme za vyplneni dotazniku. Nas tym zacal pracovat na Vasem jidelnicku. Brzy Vas budeme kontaktovat s dalsimi informacemi.\n\nS pozdravem,\nTym Bit-Fit`,
        };

        // ✅ Odeslání e-mailů
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
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server běží na portu: ${PORT}`);
});