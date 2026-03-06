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
// AŞAĞIDAKİ LİNKİ KENDİ GOOGLE SHEETS CSV LİNKİNLE DEĞİŞTİR:
const sheetCSVUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ15L7k0B1pgvq_XWBMvvIBd8Qz-Y-4BY9pQDtCpGtdeqzZ_m-vX7m3_38WL6S5aKO6t0DRVCZXOtdK/pub?output=csv";

let people = [];
const dayNames = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

window.onload = () => {
    fetchScheduleData();
    listenToWall();

    // İsim Hatırlama Özelliği - Sayfa açıldığında hafızayı kontrol et
    const savedName = localStorage.getItem("campusUserName");
    if (savedName) {
        document.getElementById("sender-name").value = savedName;
    }
};

// GÜÇLENDİRİLMİŞ VE ÖNBELLEK KIRICI VERİ ÇEKME FONKSİYONU
async function fetchScheduleData() {
    try {
        // Sonuna rastgele sayı ekleyerek telefonun eski veriyi kullanmasını engelliyoruz
        const finalUrl = sheetCSVUrl.includes('?') 
            ? sheetCSVUrl + "&t=" + new Date().getTime() 
            : sheetCSVUrl + "?t=" + new Date().getTime();

        const response = await fetch(finalUrl, { cache: "no-store" });
        
        if (!response.ok) {
            throw new Error(`Bağlantı hatası: ${response.status}`);
        }
        
        const data = await response.text();
        parseCSV(data);
        updateStatus();
        
    } catch (error) {
        // Telefonda hatanın ne olduğunu görebilmek için ekrana basıyoruz
        console.error("Veri çekilmedi:", error);
        const atSchoolList = document.getElementById('at-school-list');
        atSchoolList.innerHTML = `
            <div style="color: #ef4444; padding: 15px; background: rgba(239,68,68,0.1); border-radius: 10px; font-size: 13px; text-align: center;">
                <strong>Veri Çekilemedi!</strong><br>
                Hata: ${error.message}<br><br>
                Lütfen Google Sheets linkini kontrol et veya gizli sekmeden girmeyi dene.
            </div>`;
    }
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

        const card = document.createElement('div');
        card.className = isAtSchool ? 'person-card' : 'person-card offline-card';
        card.onclick = () => showScheduleModal(person);
        
        let cardInnerHTML = `
            <div class="card-top">
                <span class="person-name">${person.name}</span>
                <span class="click-hint">Tıkla ve Gör</span>
            </div>`;

        if (isAtSchool) {
            cardInnerHTML += `<div class="lesson-info"><span style="font-size: 16px;">📖</span> ${currentLesson}</div>`;
            card.innerHTML = cardInnerHTML;
            atSchoolList.appendChild(card);
        } else {
            card.innerHTML = cardInnerHTML;
            notAtSchoolList.appendChild(card);
        }
    });
}
setInterval(fetchScheduleData, 60000);

// --- 3. KAMPÜS DUVARI MANTIĞI ---
function listenToWall() {
    const wallMessages = document.getElementById('wall-messages');
    
    db.collection("notes").orderBy("timestamp", "desc").limit(50)
    .onSnapshot((querySnapshot) => {
        wallMessages.innerHTML = ""; 
        
        if(querySnapshot.empty) {
            wall