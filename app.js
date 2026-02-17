// Ne mets plus la clé ici !
let GEMINI_API_KEY = localStorage.getItem('GEMINI_KEY');

if (!GEMINI_API_KEY) {
    GEMINI_API_KEY = prompt("Veuillez entrer votre clé API Google AI Studio pour commencer :");
    if (GEMINI_API_KEY) {
        localStorage.setItem('GEMINI_KEY', GEMINI_API_KEY);
    }
}

const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const btnRecord = document.getElementById('btn-record');
const chatContainer = document.getElementById('chat-container');
const statusDisplay = document.getElementById('status');
const btnReset = document.getElementById('btn-reset');
const voiceSelect = document.getElementById('voice-select');
const waveContainer = document.getElementById('wave-container');
let voices = [];

// --- 1. INITIALISATION & SERVICE WORKER ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker enregistré !'))
      .catch(err => console.error('Erreur SW:', err));
  });
}

let history = [
    {
        role: "user",
        parts: [{ text: "Tu es un tuteur d'espagnol. On va avoir une conversation graduelle. 1. Réponds toujours en espagnol. 2. Si je fais une erreur, corrige-moi en français à la fin de ta réponse. 3. Pose-moi une question pour continuer. Garde des phrases courtes." }]
    },
    {
        role: "model",
        parts: [{ text: "¡Entendido! Estoy listo. ¿Cómo te llamas et comment se passe ta journée ?" }]
    }
];

// --- 2. GESTION DES VOIX ---
function loadVoices() {
    voices = window.speechSynthesis.getVoices();
    const spanishVoices = voices.filter(voice => voice.lang.includes('es'));

    voiceSelect.innerHTML = spanishVoices
        .map(voice => `<option value="${voice.name}">${voice.name} (${voice.lang})</option>`)
        .join('');

    if (spanishVoices.length === 0) {
        voiceSelect.innerHTML = '<option>Aucune voix espagnole trouvée</option>';
    }
}
window.speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();

// --- 3. RECONNAISSANCE VOCALE (VERSION PIXEL 9 / CHROME MOBILE) ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
    statusDisplay.innerText = "Micro non supporté (Utilisez Chrome)";
} else {
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = false;

    let isRecording = false;

    // Sur mobile, un clic simple "Toggle" est souvent plus fiable qu'un appui long
    btnRecord.addEventListener('click', () => {
        if (!isRecording) {
            try {
                window.speechSynthesis.cancel(); // Arrête l'IA qui parle
                recognition.start();
            } catch (e) {
                console.error("Erreur Start:", e);
            }
        } else {
            recognition.stop();
        }
    });

    recognition.onstart = () => {
        isRecording = true;
        btnRecord.style.backgroundColor = "#34a853";
        btnRecord.classList.add('recording-pulse'); // Optionnel: effet visuel
        statusDisplay.innerText = "Écoute en cours... (Cliquez pour stopper)";
    };

    recognition.onend = () => {
        isRecording = false;
        btnRecord.style.backgroundColor = "#ea4335";
        statusDisplay.innerText = "";
    };

    recognition.onerror = (event) => {
        isRecording = false;
        console.error("Erreur:", event.error);
        if (event.error === 'not-allowed') {
            alert("Merci d'autoriser le micro dans les paramètres de votre navigateur (cliquez sur le cadenas à côté de l'URL).");
        }
        statusDisplay.innerText = "Erreur: " + event.error;
    };

    recognition.onresult = async (event) => {
        const userText = event.results[0][0].transcript;
        if (userText) {
            addMessage(userText, 'user');
            await callGemini(userText);
        }
    };
}

// --- 4. APPEL API GEMINI ---
async function callGemini(text) {
    statusDisplay.innerText = "L'IA réfléchit...";
    history.push({ role: "user", parts: [{ text: text }] });

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: history })
        });

        const data = await response.json();
        
        // Vérification de sécurité pour la réponse
        if (data.candidates && data.candidates[0].content) {
            const aiReply = data.candidates[0].content.parts[0].text;
            history.push({ role: "model", parts: [{ text: aiReply }] });
            
            addMessage(aiReply, 'ai'); 
            speak(aiReply);
        }
        statusDisplay.innerText = "";
    } catch (error) {
        console.error(error);
        statusDisplay.innerText = "Erreur de connexion.";
    }
}

// --- 5. SYNTHÈSE VOCALE ---
function speak(text) {
    window.speechSynthesis.cancel(); // Stoppe une voix en cours
    const cleanText = text.replace(/\((.*?)\)/g, ""); // Enlève les corrections pour l'audio
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    const selectedVoice = voices.find(v => v.name === voiceSelect.value);
    if (selectedVoice) {
        utterance.voice = selectedVoice;
    } else {
        utterance.lang = 'es-ES';
    }

    utterance.onstart = () => waveContainer.classList.remove('wave-hidden');
    utterance.onend = () => waveContainer.classList.add('wave-hidden');
    utterance.rate = 0.9; 
    
    window.speechSynthesis.speak(utterance);
}

// --- 6. INTERFACE & RESET ---
function addMessage(text, side) {
    const bubble = document.createElement('div');
    bubble.classList.add('bubble', side);

    if (side === 'ai') {
        // Formate les (corrections) en petit italique
        bubble.innerHTML = text.replace(/\((.*?)\)/g, '<br><small style="opacity:0.8; font-style:italic;">Correction : $1</small>');
    } else {
        bubble.innerText = text;
    }

    chatContainer.appendChild(bubble);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

btnReset.addEventListener('click', () => {
    if (confirm("Voulez-vous recommencer la conversation à zéro ?")) {
        chatContainer.innerHTML = '';
        window.speechSynthesis.cancel();
        
        // Garder les instructions de tuteur mais vider la conversation
        history = [
            {
                role: "user",
                parts: [{ text: "Tu es un tuteur d'espagnol. On va avoir une conversation graduelle. 1. Réponds toujours en espagnol. 2. Si je fais une erreur, corrige-moi en français à la fin de ta réponse. 3. Pose-moi une question pour continuer. Garde des phrases courtes." }]
            }
        ];

        const welcome = "¡Entendido! He olvidado nuestra conversación. ¿De qué quieres hablar ahora?";
        addMessage(welcome, 'ai');
        speak(welcome);
    }
});