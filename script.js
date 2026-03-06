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
const sheetCSVUrl = "BURAYA_KOPYALADIGIN_CSV_LINKINI_YAPISTIR";

let people = [];
const dayNames = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

window.onload = () => {
    fetchScheduleData();
    listenToWall();

    // İsim Hatırlama
    const savedName = localStorage.getItem("campusUserName");
    if (savedName) {
        document.getElementById("sender-name").value = savedName;
    }
};

// CORS HATASINA TAKILMAYAN, GÜVENLİ ÖNBELLEK KIRICI
async function fetchScheduleData() {
    try {
        // Sadece URL'yi değiştirerek önbelleği kırıyoruz (Google bunu tehdit sanmaz)
        const finalUrl = sheetCSVUrl.includes('?') 
            ? sheetCSVUrl + "&t=" + new Date().getTime() 
            : sheetCSVUrl + "?t=" + new Date().getTime();

        // { cache: "no-store" } emrini kaldırdık!
        const response = await fetch(finalUrl);
        
        if (!response.ok) {
            throw new Error(`Bağlantı hatası: ${response.status}`);
        }
        
        const data = await response.text();
        parseCSV(data);
        updateStatus();
        
    } catch (error) {
        console.error("Veri çekilmedi:", error);
        const atSchoolList = document.getElementById('at-school-list');
        atSchoolList.innerHTML = `
            <div style="color: #ef4444; padding: 15px; background: rgba(239,68,68,0.1); border-radius: 10px; font-size: 13px; text-align: center;">
                <strong>Veri Çekilemedi!</strong><br>
                Google Sheets Linkini koda yapıştırdığından emin ol.<br>
                Hata: ${error.message}
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
            wallMessages.innerHTML = "<div class='loading-text'>Sessizlik hakim. İlk mesajı sen yaz!</div>";
            return;
        }

        let validMessageCount = 0;
        const now = new Date();
        const twoHoursInMs = 2 * 60 * 60 * 1000; 

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            
            if(data.timestamp) {
                const msgDate = data.timestamp.toDate();
                
                if (now - msgDate > twoHoursInMs) return; 
                
                validMessageCount++;

                const h = String(msgDate.getHours()).padStart(2, '0');
                const m = String(msgDate.getMinutes()).padStart(2, '0');
                const timeString = `${h}:${m}`;

                const msgHTML = `
                    <div class="message-card">
                        <div class="msg-header">
                            <span class="msg-name">${data.name}</span>
                            <span class="msg-time">${timeString}</span>
                        </div>
                        <p class="msg-text">${data.message}</p>
                    </div>
                `;
                wallMessages.insertAdjacentHTML('beforeend', msgHTML);
            }
        });

        if (validMessageCount === 0) {
            wallMessages.innerHTML = "<div class='loading-text'>Son 2 saatte hiç mesaj atılmadı.</div>";
        }
    });
}

function sendNote() {
    const nameInput = document.getElementById('sender-name');
    const messageInput = document.getElementById('message-text');
    const nameStr = nameInput.value.trim();
    const messageStr = messageInput.value.trim();

    if(nameStr === "" || messageStr === "") return;

    localStorage.setItem("campusUserName", nameStr);

    db.collection("notes").add({
        name: nameStr,
        message: messageStr,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        messageInput.value = ""; 
    }).catch((error) => console.error("Hata:", error));
}

function handleKeyPress(e) {
    if(e.key === 'Enter') {
        sendNote();
    }
}

// --- 4. MODAL KONTROLLERİ ---
const modal = document.getElementById('schedule-modal');
const closeModalBtn = document.getElementById('close-modal');

function showScheduleModal(person) {
    document.getElementById('modal-name').innerText = person.name;
    const scheduleContainer = document.getElementById('modal-schedule-list');
    scheduleContainer.innerHTML = '';
    let hasAnyClass = false;

    for(let i=1; i<=5; i++) {
        if(person.schedule[i] && person.schedule[i].length > 0) {
            hasAnyClass = true;
            const sortedClasses = person.schedule[i].sort((a, b) => a.start.localeCompare(b.start));
            let dayHTML = `<div class="schedule-day"><div class="day-title">${dayNames[i]}</div>`;
            sortedClasses.forEach(cls => {
                dayHTML += `<div class="day-class"><span class="class-time">${cls.start} - ${cls.end}</span><span class="class-name">${cls.lesson}</span></div>`;
            });
            dayHTML += `</div>`;
            scheduleContainer.innerHTML += dayHTML;
        }
    }
    if(!hasAnyClass) scheduleContainer.innerHTML = '<div class="no-class">Sisteme kayıtlı ders bulunamadı.</div>';
    modal.classList.add('active');
}

closeModalBtn.onclick = () => modal.classList.remove('active');
window.onclick = (event) => { if (event.target == modal) modal.classList.remove('active'); }