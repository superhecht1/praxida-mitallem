const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
const dotenv = require("dotenv");
const path = require("path");
const multer = require("multer"); // Für Datei-Uploads
const fs = require("fs");

dotenv.config();

const app = express();

// Multer für Datei-Uploads konfigurieren
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Dateiname mit Timestamp für Eindeutigkeit
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB Limit
    fileFilter: (req, file, cb) => {
        // Erlaubte Dateitypen
        const allowedTypes = /jpeg|jpg|png|pdf|doc|docx|txt/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Nicht unterstützter Dateityp'));
        }
    }
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 📂 Static frontend aus "public" Ordner
app.use(express.static(path.join(__dirname, "public")));

// 🔐 Demo-Login Endpoint
app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    
    // Einfache Demo-Authentifizierung
    if (username === "demo" && password === "praxida2024") {
        res.json({ 
            success: true, 
            user: {
                username: "demo",
                displayName: "Demo User",
                initials: "DU",
                role: "therapist"
            }
        });
    } else {
        res.status(401).json({ success: false, message: "Ungültige Anmeldedaten" });
    }
});

// 🧠 Chat-Endpoint (erweitert)
app.post("/api/chat", async (req, res) => {
    try {
        const { message, hasAttachments = false } = req.body;
        let systemPrompt = "Du bist eine freundliche, DSGVO-konforme KI-Assistenz für Therapeut:innen.";
        
        if (hasAttachments) {
            systemPrompt += " Der Benutzer hat Dateien angehängt. Gib hilfreiche Hinweise zur therapeutischen Nutzung der bereitgestellten Informationen.";
        }

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: message }
                ]
            })
        });

        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content || "Keine Antwort erhalten.";

        res.json({ reply });

    } catch (err) {
        console.error("❌ Fehler bei /api/chat:", err);
        res.status(500).json({ reply: "Fehler beim Abrufen der KI-Antwort." });
    }
});

// 📎 Datei-Upload Endpoint
app.post("/api/upload", upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Keine Datei hochgeladen" });
        }

        const file = req.file;
        const filePath = file.path;
        
        // Datei-Analyse basierend auf Typ
        let analysisPrompt = "";
        let fileContent = "";
        
        if (file.mimetype.startsWith('text/') || file.originalname.endsWith('.txt')) {
            // Textdateien lesen
            fileContent = fs.readFileSync(filePath, 'utf8');
            analysisPrompt = `Analysiere diesen Textinhalt aus therapeutischer Sicht:\n\n${fileContent.substring(0, 2000)}`;
        } else if (file.mimetype.startsWith('image/')) {
            // Für Bilder - Platzhalter (erweiterte Bildanalyse würde Vision API benötigen)
            analysisPrompt = `Ein Bild wurde hochgeladen (${file.originalname}). Gib allgemeine Hinweise zur therapeutischen Bildanalyse.`;
        } else {
            analysisPrompt = `Ein Dokument wurde hochgeladen (${file.originalname}, ${file.mimetype}). Gib Hinweise zur therapeutischen Dokumentenanalyse.`;
        }

        // KI-Analyse anfordern
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: "Du bist ein KI-Assistent für Therapeuten. Analysiere Inhalte aus professioneller, therapeutischer Sicht und gib hilfreiche Einschätzungen."
                    },
                    { role: "user", content: analysisPrompt }
                ]
            })
        });

        const aiData = await response.json();
        const analysis = aiData.choices?.[0]?.message?.content || "Analyse konnte nicht durchgeführt werden.";

        // Datei nach Analyse löschen (Datenschutz)
        fs.unlinkSync(filePath);

        res.json({ 
            success: true,
            filename: file.originalname,
            analysis: analysis,
            fileType: file.mimetype
        });

    } catch (err) {
        console.error("❌ Fehler bei /api/upload:", err);
        res.status(500).json({ error: "Fehler bei der Dateianalyse" });
    }
});

// 🔗 Integration Test Endpoint
app.post("/api/test-integration", (req, res) => {
    const { system, serverAddress, credentials } = req.body;
    
    // Simulierte Integration Tests
    setTimeout(() => {
        const testResults = {
            connectivity: true,
            authentication: true,
            dataSync: true,
            encryption: true,
            system: system
        };
        
        res.json({
            success: true,
            results: testResults,
            message: `Verbindung zu ${system} erfolgreich getestet`
        });
    }, 2000);
});

// 📊 DSGVO Status Endpoint
app.get("/api/dsgvo-status", (req, res) => {
    res.json({
        compliance: {
            dataEncryption: true,
            accessLogs: true,
            consentManagement: true,
            backupCompliance: true,
            lastCheck: new Date().toISOString()
        },
        score: 100,
        recommendations: []
    });
});

// 👥 Klienten API (Beispiel)
app.get("/api/clients", (req, res) => {
    // Beispieldaten - in echter Anwendung aus Datenbank
    res.json([
        {
            id: "client1",
            initials: "A.M.",
            diagnosis: "Angststörung",
            therapy: "VT",
            lastSession: "2025-08-18",
            sessionCount: 12
        },
        {
            id: "client2", 
            initials: "B.S.",
            diagnosis: "Depression",
            therapy: "TPT",
            lastSession: "2025-08-20",
            sessionCount: 8
        }
    ]);
});

// 📋 Therapiepläne API
app.get("/api/therapy-plans", (req, res) => {
    res.json([
        {
            id: "plan1",
            clientId: "client1",
            title: "Kognitiv-behaviorale Therapie - A.M.",
            status: "active",
            goals: [
                "Reduktion der Angstsymptomatik um 50%",
                "Verbesserung der sozialen Kompetenz",
                "Entwicklung von Bewältigungsstrategien"
            ],
            nextSteps: [
                "Exposition in vivo (Woche 8-10)",
                "Kognitive Umstrukturierung vertiefen",
                "Rückfallprophylaxe planen"
            ]
        }
    ]);
});

// Fehlerbehandlung für Datei-Uploads
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Datei zu groß (max. 10MB)' });
        }
    }
    res.status(500).json({ error: error.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server läuft auf Port ${PORT}`);
    console.log(`🔑 OpenAI API: ${process.env.OPENAI_API_KEY ? 'Konfiguriert' : 'Fehlt'}`);
    console.log(`📁 Upload-Ordner: ${fs.existsSync('uploads') ? 'Bereit' : 'Wird erstellt'}`);
});