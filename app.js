let GROQ_API_KEY = localStorage.getItem('GEMINI_KEY');

if (!GROQ_API_KEY) {
    GROQ_API_KEY = prompt("Veuillez entrer votre clé API Groq pour commencer :");
    if (GROQ_API_KEY) {
        localStorage.setItem('GEMINI_KEY', GROQ_API_KEY);
    }
}

const apiKey = localStorage.getItem('GEMINI_KEY');
console.log("API KEY: ", apiKey);

const btnRecord = document.getElementById('btn-record');
const chatContainer = document.getElementById('chat-container');
const statusDisplay = document.getElementById('status');
const btnReset = document.getElementById('btn-reset');
const voiceSelect = document.getElementById('voice-select');
const waveContainer = document.getElementById('wave-container');

const rateSlider = document.getElementById('rate-slider');
const pitchSlider = document.getElementById('pitch-slider');
const rateVal = document.getElementById('rate-val');
const pitchVal = document.getElementById('pitch-val');

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
        role: "assistant",
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
        playFeedback('start');
        btnRecord.style.backgroundColor = "#34a853";
        btnRecord.classList.add('recording-pulse');
        statusDisplay.innerText = "Écoute en cours... (Cliquez pour stopper)";
    };

    recognition.onend = () => {
        isRecording = false;
        playFeedback('start');
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

    // URL basée sur Gemini 2.0 Flash
    const API_URL = "https://api.groq.com/openai/v1/chat/completions";

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}` // Format standard
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile", // Un modèle très puissant
                messages: history.map(h => ({
                    role: h.role === "model" ? "assistant" : h.role,
                    content: h.parts[0].text
                }))
            })
        });

        const data = await response.json();

        if (data.choices && data.choices[0].message) {
            const aiReply = data.choices[0].message.content;
            history.push({ role: "assistant", content: aiReply });
            
            addMessage(aiReply, 'ai'); 
            speak(aiReply);
        } else if (data.error) {
            console.error("Erreur détaillée:", data.error);
            statusDisplay.innerText = "Erreur : " + data.error.message;
        }
    } catch (error) {
        console.error("Erreur réseau:", error);
        statusDisplay.innerText = "Erreur de connexion.";
    } finally {
        statusDisplay.innerText = "";
    }
}

// --- 5. SYNTHÈSE VOCALE ---
function speak(text) {
    window.speechSynthesis.cancel();
    
    const parts = text.split(/(Corrección|Correction)/i);
    const textToSpeak = parts[0].trim();

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    
    const selectedVoice = voices.find(v => v.name === voiceSelect.value);
    if (selectedVoice) {
        utterance.voice = selectedVoice;
    } else {
        utterance.lang = 'es-ES';
    }

    // --- PERSONNALISATION DYNAMIQUE ---
    utterance.rate = rateSlider.value;
    utterance.pitch = pitchSlider.value;
    
    utterance.onstart = () => waveContainer.classList.remove('wave-hidden');
    utterance.onend = () => waveContainer.classList.add('wave-hidden');
    
    window.speechSynthesis.speak(utterance);
}

// --- 6. INTERFACE & RESET ---
function addMessage(text, side) {
    const bubble = document.createElement('div');
    bubble.classList.add('bubble', side);

    if (side === 'ai') {
        // On remplace "Corrección :" ou "Correction :" par un bloc stylisé
        const formattedText = text.replace(/(Corrección|Correction)\s*:/gi, '<span class="correction-block"><strong>Correction :</strong>');
        // Si on a ouvert un span de correction, on le ferme à la fin
        bubble.innerHTML = formattedText.includes('correction-block') ? formattedText + '</span>' : formattedText;
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
        
        const welcomeText = "¡Entendido! He olvidado nuestra conversación. ¿De qué quieres hablar ahora?";

        // Réinitialisation avec alternance correcte pour l'API
        history = [
            {
                role: "user",
                parts: [{ text: "Tu es un tuteur d'espagnol. On va avoir une conversation graduelle. 1. Réponds toujours en espagnol. 2. Si je fais une erreur, corrige-moi en français à la fin de ta réponse. 3. Pose-moi une question pour continuer. Garde des phrases courtes." }]
            },
            {
                role: "model",
                parts: [{ text: welcomeText }]
            }
        ];

        addMessage(welcomeText, 'ai');
        speak(welcomeText);
        statusDisplay.innerText = "Conversation réinitialisée.";
    }
});

rateSlider.oninput = () => rateVal.innerText = rateSlider.value;
pitchSlider.oninput = () => pitchVal.innerText = pitchSlider.value;

// --- 7. JOUER UN SON À L'ÉCOUTE ---
// Fonction pour générer un retour sonore ET tactile
function playFeedback(type) {
    // 1. Retour Haptique (Vibration)
    if (navigator.vibrate) {
        if (type === 'start') {
            navigator.vibrate(40); // Une petite secousse brève de 40ms
        } else {
            navigator.vibrate([30, 50, 30]); // Deux petites secousses rapides
        }
    }

    // 2. Retour Sonore (ton code précédent)
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'start') {
        oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
    } else {
        oscillator.frequency.setValueAtTime(330, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
    }

    oscillator.type = 'sine';
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
}