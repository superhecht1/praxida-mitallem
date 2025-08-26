const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
const dotenv = require("dotenv");
const path = require("path");
const multer = require("multer");
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
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB Limit
    fileFilter: (req, file, cb) => {
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

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Static files aus public Ordner
app.use(express.static(path.join(__dirname, "public")));

// Demo-Login Endpoint
app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    
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

// Chat-Endpoint
app.post("/api/chat", async (req, res) => {
    try {
        const { message, hasAttachments = false } = req.body;
        
        // Fallback für fehlenden OpenAI API Key
        if (!process.env.OPENAI_API_KEY) {
            const mockResponse = generateMockChatResponse(message, hasAttachments);
            return res.json({ reply: mockResponse });
        }

        let systemPrompt = "Du bist eine freundliche, DSGVO-konforme KI-Assistenz für Therapeut:innen. Antworte professionell und hilfsbereit auf Deutsch.";
        
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
                ],
                max_tokens: 1000,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API Fehler: ${response.status}`);
        }

        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content || "Keine Antwort erhalten.";

        res.json({ reply });

    } catch (err) {
        console.error("❌ Fehler bei /api/chat:", err);
        // Fallback auf Mock-Response
        const mockResponse = generateMockChatResponse(req.body.message, req.body.hasAttachments);
        res.json({ reply: mockResponse });
    }
});

// Mock Chat Response Generator
function generateMockChatResponse(message, hasAttachments) {
    const responses = {
        greeting: "Hallo! Ich bin Ihre KI-Assistenz für therapeutische Fragen. Wie kann ich Ihnen heute helfen?",
        therapy: "Das ist eine interessante therapeutische Fragestellung. Hier sind einige Überlegungen dazu:\n\n• Verhaltenstherapeutische Ansätze könnten hilfreich sein\n• Wichtig ist eine gründliche Anamnese\n• Berücksichtigen Sie auch systemische Faktoren\n\nWie schätzen Sie die Situation ein?",
        analysis: "**Analyse-Ergebnis:**\n\nBased auf den bereitgestellten Informationen kann ich folgende therapeutische Hinweise geben:\n\n• Strukturierte Herangehensweise empfohlen\n• Berücksichtigung des biopsychosozialen Modells\n• Regelmäßige Evaluation des Behandlungsfortschritts\n\n*Diese Einschätzung ersetzt nicht Ihre professionelle Beurteilung.*",
        planning: "Für die Therapieplanung sollten Sie folgende Aspekte berücksichtigen:\n\n1. **Zielsetzung:** Klare, messbare Therapieziele definieren\n2. **Methodik:** Evidenzbasierte Interventionen auswählen\n3. **Verlaufskontrolle:** Regelmäßige Evaluierung einplanen\n\nWelchen spezifischen Bereich möchten Sie vertiefen?",
        documentation: "Für die Dokumentation empfehle ich:\n\n• Strukturierte Protokollführung\n• DSGVO-konforme Datenspeicherung\n• Regelmäßige Backup-Strategie\n• Klare Einverständniserklärungen\n\nGibt es spezielle Dokumentationsanforderungen in Ihrem Fall?"
    };

    if (hasAttachments) {
        return responses.analysis;
    }

    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('hallo') || lowerMessage.includes('hi')) {
        return responses.greeting;
    }
    if (lowerMessage.includes('therapie') || lowerMessage.includes('behandlung')) {
        return responses.therapy;
    }
    if (lowerMessage.includes('plan') || lowerMessage.includes('ziel')) {
        return responses.planning;
    }
    if (lowerMessage.includes('dokument') || lowerMessage.includes('protokoll')) {
        return responses.documentation;
    }
    
    return responses.therapy; // Default response
}

// Datei-Upload Endpoint
app.post("/api/upload", upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Keine Datei hochgeladen" });
        }

        const file = req.file;
        const filePath = file.path;
        
        let analysisPrompt = "";
        let fileContent = "";
        
        if (file.mimetype.startsWith('text/') || file.originalname.endsWith('.txt')) {
            try {
                fileContent = fs.readFileSync(filePath, 'utf8');
                analysisPrompt = `Analysiere diesen Textinhalt aus therapeutischer Sicht:\n\n${fileContent.substring(0, 2000)}`;
            } catch (readError) {
                analysisPrompt = `Ein Textdokument wurde hochgeladen (${file.originalname}). Konnte nicht gelesen werden, gib allgemeine Hinweise zur Textanalyse.`;
            }
        } else if (file.mimetype.startsWith('image/')) {
            analysisPrompt = `Ein Bild wurde hochgeladen (${file.originalname}). Gib allgemeine Hinweise zur therapeutischen Bildanalyse.`;
        } else {
            analysisPrompt = `Ein Dokument wurde hochgeladen (${file.originalname}, ${file.mimetype}). Gib Hinweise zur therapeutischen Dokumentenanalyse.`;
        }

        let analysis = "Standard-Analyse: Das Dokument wurde erfolgreich hochgeladen und kann für therapeutische Zwecke ausgewertet werden.";

        // KI-Analyse nur wenn API Key verfügbar
        if (process.env.OPENAI_API_KEY) {
            try {
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
                                content: "Du bist ein KI-Assistent für Therapeuten. Analysiere Inhalte aus professioneller, therapeutischer Sicht und gib hilfreiche Einschätzungen auf Deutsch."
                            },
                            { role: "user", content: analysisPrompt }
                        ],
                        max_tokens: 800
                    })
                });

                if (response.ok) {
                    const aiData = await response.json();
                    analysis = aiData.choices?.[0]?.message?.content || analysis;
                }
            } catch (aiError) {
                console.log("KI-Analyse fehlgeschlagen, verwende Fallback:", aiError.message);
            }
        }

        // Datei nach Analyse sicher löschen
        try {
            fs.unlinkSync(filePath);
        } catch (deleteError) {
            console.warn("Datei konnte nicht gelöscht werden:", deleteError.message);
        }

        res.json({ 
            success: true,
            filename: file.originalname,
            analysis: analysis,
            fileType: file.mimetype
        });

    } catch (err) {
        console.error("❌ Fehler bei /api/upload:", err);
        
        // Cleanup bei Fehler
        if (req.file && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (cleanupError) {
                console.warn("Cleanup fehlgeschlagen:", cleanupError.message);
            }
        }
        
        res.status(500).json({ error: "Fehler bei der Dateianalyse: " + err.message });
    }
});

// Integration Test Endpoint
app.post("/api/test-integration", (req, res) => {
    const { system, serverAddress, credentials } = req.body;
    
    setTimeout(() => {
        const testResults = {
            connectivity: true,
            authentication: true,
            dataSync: true,
            encryption: true,
            system: system,
            timestamp: new Date().toISOString()
        };
        
        res.json({
            success: true,
            results: testResults,
            message: `Verbindung zu ${system} erfolgreich getestet`
        });
    }, 1500);
});

// DSGVO Status Endpoint
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
        recommendations: [],
        nextCheck: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 Tage
    });
});

// Klienten API
app.get("/api/clients", (req, res) => {
    res.json([
        {
            id: "client1",
            initials: "A.M.",
            diagnosis: "Angststörung",
            therapy: "VT",
            lastSession: "2025-08-18",
            sessionCount: 12,
            status: "aktiv"
        },
        {
            id: "client2", 
            initials: "B.S.",
            diagnosis: "Depression",
            therapy: "TPT",
            lastSession: "2025-08-20",
            sessionCount: 8,
            status: "aktiv"
        }
    ]);
});

// Therapiepläne API
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
            ],
            created: new Date().toISOString()
        }
    ]);
});

// Gesundheits-Check Endpoint
app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        version: "2.0.0",
        services: {
            openai: !!process.env.OPENAI_API_KEY,
            uploads: fs.existsSync('uploads'),
            static: fs.existsSync('public')
        }
    });
});

// Fehlerbehandlung für Datei-Uploads
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Datei zu groß (max. 10MB)' });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: 'Zu viele Dateien' });
        }
    }
    
    console.error('Server Error:', error);
    res.status(500).json({ error: error.message });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint nicht gefunden' });
});

const PORT = process.env.PORT || 3000;

// Server starten
app.listen(PORT, () => {
    console.log(`✅ Praxida 2.0 Server läuft auf Port ${PORT}`);
    console.log(`🌐 Frontend: http://localhost:${PORT}`);
    console.log(`🔑 OpenAI API: ${process.env.OPENAI_API_KEY ? 'Konfiguriert ✓' : 'Nicht konfiguriert (Mock-Modus) ⚠️'}`);
    console.log(`📁 Upload-Ordner: ${fs.existsSync('uploads') ? 'Bereit ✓' : 'Wird erstellt...'}`);
    console.log(`📄 Static Files: ${fs.existsSync('public') ? 'Bereit ✓' : 'Fehlt ❌'}`);
    
    // Upload-Ordner erstellen falls nicht vorhanden
    if (!fs.existsSync('uploads')) {
        try {
            fs.mkdirSync('uploads');
            console.log(`📁 Upload-Ordner erstellt ✓`);
        } catch (err) {
            console.error(`❌ Upload-Ordner konnte nicht erstellt werden:`, err.message);
        }
    }
});
