const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
require('dotenv').config(); // Načtení proměnných prostředí
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);


const app = express();

// ✅ Přesměrování HTTP na HTTPS a www na non-www
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, 'https://' + req.headers.host.replace(/^www\./, '') + req.url);
  }
  if (req.headers.host.startsWith('www.')) {
    return res.redirect(301, 'https://' + req.headers.host.replace(/^www\./, '') + req.url);
  }
  next();
});


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
    totalPrice = 0,
    discountCode = "Nepoužit" // Pokud není kód použit, uloží se "Nepoužit"
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

    doc.fontSize(16).text(removeDiacritics('Bit-Fit: Osobní dotazník'), { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(removeDiacritics(`Jméno: ${name}`));
    doc.text(removeDiacritics(`E-mail: ${email}`));
    doc.text(removeDiacritics(`Věk: ${age}`));
    doc.text(removeDiacritics(`Pohlaví: ${gender}`));
    doc.text(removeDiacritics(`Výška: ${height} cm`));
    doc.text(removeDiacritics(`Váha: ${weight} kg`));
    doc.text(removeDiacritics(`Cílová váha: ${targetWeight} kg`));

    // ✅ Přidání chybějících polí
    doc.moveDown();
    doc.text(removeDiacritics(`Historie diet: ${dietHistory || 'Neuvedeno'}`));
    doc.text(removeDiacritics(`Oblíbené potraviny: ${foodPreferences || 'Neuvedeno'}`));
    doc.text(removeDiacritics(`Neoblíbené potraviny: ${restrictions || 'Neuvedeno'}`));
    doc.text(removeDiacritics(`Cíle: ${goals || 'Neuvedeno'}`));
    doc.text(removeDiacritics(`Poznámky: ${notes || 'Neuvedeno'}`));

    doc.moveDown();
    doc.text(removeDiacritics(`Způsob platby: ${paymentMethod}`));
    doc.text(removeDiacritics(`Status platby: Zaplaceno`));
    doc.moveDown();
    doc.text(removeDiacritics(`Vybraný plán: ${planName}`));
    doc.text(removeDiacritics(`Cena plánu: ${planPrice} Kč`));
    doc.text(removeDiacritics(`Požaduje recepty: ${wantsRecipes ? 'Ano' : 'Ne'}`));
    doc.text(removeDiacritics(`Cena za recepty: ${recipePrice} Kč`));
    doc.text(removeDiacritics(`Celková cena: ${totalPrice} Kč`));
    doc.text(removeDiacritics(`Slevový kód: ${discountCode}`));
    doc.end();

    writeStream.on('finish', async () => {
      try {
        const msgToAdmin = {
          to: 'info@bit-fit.cz',
          from: 'info@bit-fit.cz', // tato adresa by měla být ověřená v SendGrid
          subject: 'Nový dotazník - Bit-Fit',
          html: `<p>📎 V příloze naleznete nový vyplněný dotazník.</p>`,
          attachments: [
            {
              content: fs.readFileSync(pdfPath).toString('base64'),
              filename: 'form_output.pdf',
              type: 'application/pdf',
              disposition: 'attachment',
            },
          ],
        };
        
        const msgToClient = {
          to: email,
          from: 'info@bit-fit.cz',
          subject: '✅ Potvrzení přijetí dotazníku - Bit-Fit',
          html: `<p>Dobrý den ${name},<br><br>Děkujeme za vyplnění dotazníku. Náš tým začal pracovat na vašem jídelníčku. Brzy vás budeme kontaktovat.<br><br>S pozdravem,<br>Bit-Fit tým</p>`,
        };
        
        console.log("📩 Odesílám e-mail administrátorovi...");
        await sgMail.send(msgToAdmin);
        
        console.log("📩 Odesílám e-mail klientovi...");
        await sgMail.send(msgToClient);
        
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

// ✅ Route pro odesílání kontaktního formuláře
app.post('/api/contact', async (req, res) => {
  console.log("📩 Přijatá kontaktní zpráva:", req.body);

  const { name, email, subject, message } = req.body;

  if (!name || !email || !message) {
    console.error("❌ Chybějící povinné údaje.");
    return res.status(400).json({ success: false, error: "Vyplňte všechna povinná pole." });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: parseInt(process.env.SMTP_PORT, 10) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const mailOptions = {
      from: process.env.SMTP_USER,
      to: process.env.SMTP_USER,
      subject: `📩 Nová zpráva z kontaktního formuláře: ${subject || "Žádný předmět"}`,
      text: `Jméno: ${name}\nE-mail: ${email}\n\nZpráva:\n${message}`,
    };

    await transporter.sendMail(mailOptions);
    console.log("✅ Kontaktní formulář úspěšně odeslán.");

    res.status(200).json({ success: true, message: "Zpráva byla úspěšně odeslána." });

  } catch (error) {
    console.error("❌ Chyba při odesílání e-mailu:", error);
    res.status(500).json({ success: false, error: "Nepodařilo se odeslat zprávu. Zkuste to znovu." });
  }
});

app.listen(process.env.PORT || 1337, () => console.log("🚀 Server běží!"));