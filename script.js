// --- 1. FIREBASE BAĞLANTISI ---
const firebaseConfig = {
    apiKey: "AIzaSyCOWkk_9_dfmitVWbDhAVHsU9uIXeCuZPM",
    authDomain: "campus-radar-v2-eedf6.firebaseapp.com",
    projectId: "campus-radar-v2-eedf6",
    storageBucket: "campus-radar-v2-eedf6.firebasestorage.app",
    messagingSenderId: "997707682300",
    appId: "1:997707682300:web:e92fd9f7861e4ac641a279"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- 2. GOOGLE SHEETS BAĞLANTISI ---
const sheetCSVUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ15L7k0B1pgvq_XWBMvvIBd8Qz-Y-4BY9pQDtCpGtdeqzZ_m-vX7m3_38WL6S5aKO6t0DRVCZXOtdK/pub?output=csv";

let people = [];
let activeLocations = {}; 
const dayNames = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

window.onload = () => {
    fetchScheduleData();
    listenToWall();
    listenToLocations(); 
    listenToNotepad(); 
    updateExamCounter(); 

    const savedName = localStorage.getItem("campusUserName");
    if (savedName) document.getElementById("sender-name").value = savedName;
    
    // Püf Nokta: Sürpriz butonları sayfa tamamen yüklendikten sonra aktif ediyoruz!
    setupEasterEggs();
};

async function fetchScheduleData() {
    try {
        const finalUrl = sheetCSVUrl.includes('?') ? sheetCSVUrl + "&t=" + new Date().getTime() : sheetCSVUrl + "?t=" + new Date().getTime();
        const response = await fetch(finalUrl);
        if (!response.ok) throw new Error(`Bağlantı hatası: ${response.status}`);
        const data = await response.text();
        parseCSV(data);
        updateStatus();
    } catch (error) { console.error("Veri çekilmedi:", error); }
}

function parseCSV(csvText) {
    people = []; 
    const rows = csvText.split('\n').slice(1); 
    const dayMap = { "Pazar": 0, "Pazartesi": 1, "Salı": 2, "Çarşamba": 3, "Perşembe": 4, "Cuma": 5, "Cumartesi": 6 };
    const peopleObj = {};

    rows.forEach(row => {
        if (!row.trim()) return;
        const cols = row.split(','); 
        if (cols.length >= 5) {
            const name = cols[0].trim();
            const dayText = cols[1].trim();
            const start = cols[2].trim().substring(0, 5); 
            const end = cols[3].trim().substring(0, 5);
            const lesson = cols[4].trim();
            const dayNum = dayMap[dayText];

            if (dayNum !== undefined) {
                if (!peopleObj[name]) peopleObj[name] = { name: name, schedule: {} };
                if (!peopleObj[name].schedule[dayNum]) peopleObj[name].schedule[dayNum] = [];
                peopleObj[name].schedule[dayNum].push({start: start, end: end, lesson: lesson});
            }
        }
    });
    people = Object.values(peopleObj);
}

// --- KONUMLARI DİNLE ---
function listenToLocations() {
    db.collection("locations").onSnapshot((querySnapshot) => {
        activeLocations = {}; 
        const now = new Date();
        const fifteenMinsInMs = 15 * 60 * 1000;

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if(data.timestamp) {
                const locDate = data.timestamp.toDate();
                if (now - locDate < fifteenMinsInMs) {
                    activeLocations[doc.id] = data.location;
                }
            }
        });
        updateStatus(); 
    });
}

function updateStatus() {
    const now = new Date();
    const currentDay = now.getDay();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    document.getElementById('datetime-display').innerText = `${dayNames[currentDay]} • ${hours}:${minutes}`;

    const atSchoolList = document.getElementById('at-school-list');
    const notAtSchoolList = document.getElementById('not-at-school-list');
    atSchoolList.innerHTML = ''; notAtSchoolList.innerHTML = '';

    people.forEach(person => {
        let isAtSchool = false; let currentLesson = "";
        const todaySchedule = person.schedule[currentDay];
        if (todaySchedule) {
            for (let slot of todaySchedule) {
                if (`${hours}:${minutes}` >= slot.start && `${hours}:${minutes}` < slot.end) {
                    isAtSchool = true; currentLesson = slot.lesson; break;
                }
            }
        }

        const manualLoc = activeLocations[person.name];
        if (manualLoc) isAtSchool = true;

        const card = document.createElement('div');
        card.className = isAtSchool ? 'person-card' : 'person-card offline-card';
        card.onclick = () => showScheduleModal(person);
        
        let cardInnerHTML = `<div class="card-top"><span class="person-name">${person.name}</span><span class="click-hint">Tıkla ve Gör</span></div>`;
        if (manualLoc) cardInnerHTML += `<div class="lesson-info"><span style="font-size: 16px;">📍</span> Nerede: ${manualLoc}</div>`;
        else if (isAtSchool) cardInnerHTML += `<div class="lesson-info"><span style="font-size: 16px;">📖</span> Derste: ${currentLesson}</div>`;

        card.innerHTML = cardInnerHTML;
        if (isAtSchool) atSchoolList.appendChild(card);
        else notAtSchoolList.appendChild(card);
    });
}
setInterval(fetchScheduleData, 60000);

// --- KAMPÜS DUVARI ---
function listenToWall() {
    const wallMessages = document.getElementById('wall-messages');
    db.collection("notes").orderBy("timestamp", "desc").limit(50).onSnapshot((querySnapshot) => {
        wallMessages.innerHTML = ""; 
        if(querySnapshot.empty) { wallMessages.innerHTML = "<div class='loading-text'>Sessizlik hakim. İlk mesajı sen yaz!</div>"; return; }

        let validCount = 0; const now = new Date(); const twentyFourHoursInMs = 24 * 60 * 60 * 1000;

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if(data.timestamp) {
                const msgDate = data.timestamp.toDate();
                if (now - msgDate > twentyFourHoursInMs) return; 
                validCount++;
                const h = String(msgDate.getHours()).padStart(2, '0'); const m = String(msgDate.getMinutes()).padStart(2, '0');
                
                wallMessages.insertAdjacentHTML('afterbegin', `
                    <div class="message-card">
                        <div class="msg-header"><span class="msg-name">${data.name}</span><span class="msg-time">${h}:${m}</span></div>
                        <p class="msg-text">${data.message}</p>
                    </div>`);
            }
        });
        if (validCount === 0) {
            wallMessages.innerHTML = "<div class='loading-text'>Son 24 saatte hiç mesaj atılmadı.</div>";
        } else {
            wallMessages.scrollTop = wallMessages.scrollHeight; 
        }
    });
}

function sendNote() {
    const nameStr = document.getElementById('sender-name').value.trim();
    const messageStr = document.getElementById('message-text').value.trim();
    if(nameStr === "" || messageStr === "") return;

    localStorage.setItem("campusUserName", nameStr);
    db.collection("notes").add({ name: nameStr, message: messageStr, timestamp: firebase.firestore.FieldValue.serverTimestamp() })
    .then(() => { document.getElementById('message-text').value = ""; }).catch(err => console.error(err));
}
function handleKeyPress(e) { if(e.key === 'Enter') sendNote(); }

// --- SABİT NOTLAR ---
function listenToNotepad() {
    const notepadList = document.getElementById('notepad-list');
    db.collection("persistent_notes").orderBy("timestamp", "asc").onSnapshot((querySnapshot) => {
        notepadList.innerHTML = ""; 
        if(querySnapshot.empty) { notepadList.innerHTML = "<div class='loading-text'>Henüz önemli bir not eklenmemiş.</div>"; return; }

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            let dateStr = "";
            if(data.timestamp) {
                const date = data.timestamp.toDate();
                const d = String(date.getDate()).padStart(2, '0'); const mo = String(date.getMonth() + 1).padStart(2, '0');
                const h = String(date.getHours()).padStart(2, '0'); const m = String(date.getMinutes()).padStart(2, '0');
                dateStr = `${d}/${mo} ${h}:${m}`;
            }
            
            notepadList.insertAdjacentHTML('beforeend', `
                <div class="message-card" style="border-left: 3px solid #f59e0b; background: #0f172a;">
                    <div class="msg-header"><span class="msg-name" style="color: #f59e0b;">${data.name}</span><span class="msg-time">${dateStr}</span></div>
                    <p class="msg-text">${data.message}</p>
                </div>`);
        });
        notepadList.scrollTop = notepadList.scrollHeight;
    });
}

document.getElementById('add-notepad-btn').onclick = () => {
    const msgInput = document.getElementById('notepad-input');
    const messageStr = msgInput.value.trim();
    let nameStr = localStorage.getItem("campusUserName") || document.getElementById('sender-name').value.trim() || "Anonim";
    if(messageStr === "") return;

    db.collection("persistent_notes").add({ name: nameStr, message: messageStr, timestamp: firebase.firestore.FieldValue.serverTimestamp() })
    .then(() => { msgInput.value = ""; }).catch(err => console.error(err));
};

// --- MODAL KONTROLLERİ ---
const scheduleModal = document.getElementById('schedule-modal');
const notepadModal = document.getElementById('notepad-modal');

function showScheduleModal(person) {
    document.getElementById('modal-name').innerText = person.name;
    const scheduleContainer = document.getElementById('modal-schedule-list');
    scheduleContainer.innerHTML = '';
    
    const updateLoc = (locVal) => {
        db.collection("locations").doc(person.name).set({ location: locVal, timestamp: firebase.firestore.FieldValue.serverTimestamp() })
        .then(() => { scheduleModal.classList.remove('active'); }).catch(err => alert("Hata: " + err));
    };

    document.getElementById('loc-btn-podyum').onclick = () => updateLoc('Podyum');
    document.getElementById('loc-btn-kantin').onclick = () => updateLoc('Kantin');
    document.getElementById('loc-btn-ring').onclick = () => updateLoc('Ring');
    document.getElementById('loc-btn-sigara').onclick = () => updateLoc('Kantin Arkası 🚬');
    document.getElementById('loc-btn-carsi').onclick = () => updateLoc('Çarşıda');
    document.getElementById('loc-btn-bilardo').onclick = () => updateLoc('Yab. Dil. Bilardo 🎱');
    document.getElementById('loc-btn-yemekhane').onclick = () => updateLoc('Yemekhane 🍽️');

    let hasAnyClass = false;
    for(let i=1; i<=5; i++) {
        if(person.schedule[i] && person.schedule[i].length > 0) {
            hasAnyClass = true;
            const sortedClasses = person.schedule[i].sort((a, b) => a.start.localeCompare(b.start));
            let dayHTML = `<div class="schedule-day"><div class="day-title">${dayNames[i]}</div>`;
            sortedClasses.forEach(cls => { dayHTML += `<div class="day-class"><span class="class-time">${cls.start} - ${cls.end}</span><span class="class-name">${cls.lesson}</span></div>`; });
            dayHTML += `</div>`;
            scheduleContainer.innerHTML += dayHTML;
        }
    }
    if(!hasAnyClass) scheduleContainer.innerHTML = '<div class="no-class">Sisteme kayıtlı ders bulunamadı.</div>';
    scheduleModal.classList.add('active');
}

document.getElementById('close-modal').onclick = () => scheduleModal.classList.remove('active');
document.getElementById('open-notepad-btn').onclick = () => notepadModal.classList.add('active');
document.getElementById('close-notepad-btn').onclick = () => notepadModal.classList.remove('active');

window.onclick = (event) => { 
    if (event.target == scheduleModal) scheduleModal.classList.remove('active'); 
    if (event.target == notepadModal) notepadModal.classList.remove('active'); 
}

function updateExamCounter() {
    const counterDiv = document.getElementById('exam-counter');
    if(!counterDiv) return;

    const now = new Date();
    now.setHours(0,0,0,0); 

    const exams = [
        { name: "Vize", start: new Date(2026, 3, 6), end: new Date(2026, 3, 10) },
        { name: "Final", start: new Date(2026, 5, 8), end: new Date(2026, 5, 19) },
        { name: "Büt", start: new Date(2026, 5, 30), end: new Date(2026, 6, 3) }
    ];

    let statusText = "Tatil Modu 🏖️"; 

    for (let i = 0; i < exams.length; i++) {
        const exam = exams[i];
        
        if (now < exam.start) {
            const diffTime = Math.abs(exam.start - now);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            statusText = `${exam.name}lere Son ${diffDays} Gün ⏳`;
            break;
        } else if (now >= exam.start && now <= exam.end) {
            const diffTime = Math.abs(now - exam.start);
            const dayNum = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            statusText = `${exam.name} Haftası (${dayNum}. Gün) ✍️`;
            break;
        }
    }

    counterDiv.innerText = statusText;
}

// --- EASTER EGGS (ZIRHLI VE GARANTİLİ YAPI) ---
function setupEasterEggs() {
    const logoArea = document.querySelector('.logo-area');
    const secretModal = document.getElementById('secret-photo-overlay');
    const fotoAudio = new Audio("foto-muzik.mp3");
    fotoAudio.loop = true;

    let logoClickCount = 0;
    let logoClickTimer;

    if (logoArea && secretModal) {
        logoArea.style.cursor = "pointer"; 
        logoArea.onclick = () => {
            logoClickCount++;
            clearTimeout(logoClickTimer);
            
            if (logoClickCount === 3) {
                secretModal.classList.add('active');
                fotoAudio.play().catch(e => console.log("Müzik hatası:", e));
                logoClickCount = 0; 
            } else {
                logoClickTimer = setTimeout(() => { logoClickCount = 0; }, 2000);
            }
        };

        const closeBtn = document.getElementById('close-secret-btn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                secretModal.classList.remove('active');
                fotoAudio.pause();
                fotoAudio.currentTime = 0;
            };
        }
    }

    const datetimeDisplay = document.getElementById('datetime-display');
    const retroAudio = new Audio("retro.mp3");
    retroAudio.loop = true;
    
    let retroClickCount = 0;
    let retroClickTimer;

    if (datetimeDisplay) {
        datetimeDisplay.style.cursor = "pointer"; 
        datetimeDisplay.onclick = () => {
            retroClickCount++;
            clearTimeout(retroClickTimer); 
            
            if (retroClickCount === 5) {
                document.body.classList.toggle('retro-mode');
                
                if (document.body.classList.contains('retro-mode')) {
                    retroAudio.play().catch(e => console.log("Müzik hatası:", e));
                } else {
                    retroAudio.pause();
                    retroAudio.currentTime = 0;
                }
                retroClickCount = 0; 
            } else {
                retroClickTimer = setTimeout(() => { retroClickCount = 0; }, 2000);
            }
        };
    }
}