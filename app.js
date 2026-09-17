// =========================================================================
// app.js - Part 1 (초고속 연동망 복구 및 데이터 무결성 보호 패치 버전)
// =========================================================================
const GOOGLE_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzzb9Fme3-R6FL-twHsbKrBQg4uMHgaiQlU57RPBsi5PW1GEPuwrZnRtyc4B5jZYHeJ/exec';
const SHEET_URL = GOOGLE_WEB_APP_URL; 

let rawData = [];
const STORAGE_KEY = 'game_item_checklist_v3';
let checkedItems = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};

let currentMain = '';            // A열: 분류 필터링 타겟
let currentRewardFilter = 'ALL';       // F열: 거래 여부 필터링 타겟
let currentStatusFilter = 'ALL';       // 보유/미보유 상태 필터 타겟
let currentSearchQuery = ''; 

// 1. 원격 구글 시트 텍스트 배열 스트림 단일 회선 초고속 수집
async function fetchData() {
    try {
        const res = await fetch(SHEET_URL);
        if (!res.ok) throw new Error(`웹 앱 API 서버 응답 오류 (상태코드: ${res.status})`);
        
        const rows = await res.json();
        if (!rows || rows.length <= 1) throw new Error("시트 내부 데이터 레코드가 부족하거나 비어있습니다.");

        // 🌟 [파싱 엔진 전면 전수조사 개조]
        // 열 순서 밀림 버그를 원천 차단하기 위해, 각 행에서 이미지 주소(http)가 들어있는 셀을 동적으로 찾아 매핑합니다.
        rawData = rows.slice(1).map((row) => {
            if (!row || !Array.isArray(row)) return null;
            
            const getVal = (colIdx) => {
                return row[colIdx] !== undefined && row[colIdx] !== null ? String(row[colIdx]).trim() : '';
            };

            // 행 전체에서 http나 https로 시작하는 진짜 이미지 URL 주소 자동 색출
            let detectedIconUrl = '';
            for (let cell of row) {
                const strCell = String(cell).trim();
                if (strCell.startsWith('http://') || strCell.startsWith('https://')) {
                    detectedIconUrl = strCell;
                    break;
                }
            }

            const itemName = getVal(2); // C열: 이름
            const parsedPatchNum = parseFloat(getVal(3).replace(/[^0-9.]/g, '')) || 1;

            return {
                id: itemName,           
                main: getVal(0),        // A열: 분류 (대분류)
                sub: '전체 목록',       
                icon: detectedIconUrl,  // 동적 자동 검출 시스템으로 엑박 깨짐 현상 원천 봉쇄
                name: itemName,         // C열: 이름
                patch: getVal(3),        // D열: 패치
                condition: getVal(4),   // E열: 획득처
                score: parsedPatchNum,  
                rewardType: getVal(5),  // F열: 거래 여부
                rewardContent: getVal(5)
            };
        }).filter(item => item && item.name && item.main); 

        initMenu();
        initRewardMenu(); 
        calculateTotalProgress();
    } catch (error) {
        console.error(error);
        document.getElementById('achievement-list').innerHTML = `
            <tr><td colspan="7" style="text-align: center; color: #ff4d4d; font-weight: bold; padding: 40px;">
                데이터베이스를 연동하는 중입니다... 오류 발생<br>
                <span style="color: #aaa; font-size: 0.9em; font-weight: normal;">원인: ${error.message}</span>
            </td></tr>`;
    }
}

// 2. 검색 인터페이스 키인 핸들러
function handleSearchInput() {
    const inputElement = document.getElementById('search-keyword');
    currentSearchQuery = inputElement.value.trim().toLowerCase();
    renderList(); 
}

// 3. 아이템 획득 상태(보유/미보유) 스위칭 컨트롤러
function selectStatusFilter(status) {
    currentStatusFilter = status;
    document.querySelectorAll('.status-filter-btn').forEach(btn => btn.classList.remove('active'));
    if(status === 'ALL') document.getElementById('status-all').classList.add('active');
    if(status === 'UNCOMPLETED') document.getElementById('status-uncompleted').classList.add('active');
    if(status === 'COMPLETED') document.getElementById('status-completed').classList.add('active');
    renderList();
}

// 4. 카테고리 선택(A열 분류) 동적 HTML 노드 버튼 빌더
function initMenu() {
    const mains = [...new Set(rawData.map(item => item.main))];
    const mainGroup = document.getElementById('main-category-group');
    mainGroup.innerHTML = '';

    mains.forEach((main, idx) => {
        if(!main) return;
        const btn = document.createElement('button');
        btn.textContent = main;
        btn.onclick = () => selectMainCategory(main, btn);
        if(idx === 0) btn.click(); 
        mainGroup.appendChild(btn);
    });
}

function selectMainCategory(main, btn) {
    currentMain = main;
    currentRewardFilter = 'ALL'; 
    updateRewardFilterActive();

    document.querySelectorAll('#main-category-group button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const subGroup = document.getElementById('sub-category-group');
    subGroup.innerHTML = '';
    const sBtn = document.createElement('button');
    sBtn.textContent = '전체 아이템 도감';
    sBtn.classList.add('active');
    subGroup.appendChild(sBtn);

    document.getElementById('current-path-display').textContent = `📂 분류 : ${currentMain}`;
    renderList();
}
// =========================================================================
// app.js - Part 2 (CORS 우회 주소 재정립 및 강제 동기화 리셋 패치 스코프)
// =========================================================================

// 5. 거래 여부(F열) 필터 버튼 동적 생성 및 이름 완벽 치환 + 자동 리셋 인터페이스
function initRewardMenu() {
    const rewardTypes = [...new Set(rawData.map(item => item.rewardType))].filter(t => t && t !== '-');
    const rewardGroup = document.getElementById('reward-category-group');
    rewardGroup.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.textContent = '필터 해제'; 
    allBtn.classList.add('reward-filter-btn', 'active');
    allBtn.id = 'rw-btn-all';
    allBtn.onclick = () => selectRewardFilter('ALL', allBtn);
    rewardGroup.appendChild(allBtn);

    rewardTypes.forEach(type => {
        const btn = document.createElement('button');
        let displayBtnText = type;
        const cleanType = type.trim().toUpperCase();
        
        if (cleanType === 'O' || cleanType === 'Y' || cleanType.includes('가능')) {
            displayBtnText = '거래 가능';
        } else if (cleanType === 'X' || cleanType === 'N' || cleanType.includes('불가')) {
            displayBtnText = '거래 불가';
        }
        
        btn.textContent = displayBtnText; 
        btn.classList.add('reward-filter-btn');
        btn.onclick = () => selectRewardFilter(type, btn); 
        rewardGroup.appendChild(btn);
    });
}

// 🌟 [버그 완전 수술] 거래 조건 클릭 시 카테고리 고정 변수 자체를 파쇄하여 복합 조건부 락을 완전히 해제합니다.
function selectRewardFilter(type, btn) {
    currentRewardFilter = type;
    document.querySelectorAll('.reward-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (type === 'ALL') {
        // 필터 해제 시 강제로 첫 번째 카테고리 요소 재클릭 유도 초기화
        const firstMainBtn = document.querySelector('#main-category-group button');
        if (firstMainBtn) firstMainBtn.click();
    } else {
        // ⚡ [핵심 패치] 현재 활성화된 대분류 변수를 완전히 비워 화면에 전체 조건으로 렌더링되게 만듭니다.
        currentMain = ''; 
        document.querySelectorAll('#main-category-group button').forEach(b => b.classList.remove('active'));

        // 보유 상태 필터 변수를 무조건 초기화하고 HTML 버튼의 active 불빛도 강제 이동시킵니다.
        currentStatusFilter = 'ALL';
        document.querySelectorAll('.status-filter-btn').forEach(b => b.classList.remove('active'));
        const statusAllBtn = document.getElementById('status-all');
        if (statusAllBtn) statusAllBtn.classList.add('active');

        // 검색창 내부에 타이핑된 내용과 연동 변수를 강제로 공백 제거 청소합니다.
        currentSearchQuery = '';
        const searchInput = document.getElementById('search-keyword');
        if (searchInput) searchInput.value = '';
        
        let displayPathText = type;
        const cleanType = type.trim().toUpperCase();
        if (cleanType === 'O' || cleanType === 'Y' || cleanType.includes('가능')) displayPathText = '거래 가능';
        else if (cleanType === 'X' || cleanType === 'N' || cleanType.includes('불가')) displayPathText = '거래 불가';

        document.getElementById('current-path-display').textContent = `⚖️ [필터] 거래 여부 : ${displayPathText}`; 
    }
    renderList(); // 전 지역 횡단 필터 렌더링 스코프 재가동
}

function updateRewardFilterActive() {
    document.querySelectorAll('.reward-filter-btn').forEach(b => b.classList.remove('active'));
    const allBtn = document.getElementById('rw-btn-all');
    if(allBtn) allBtn.classList.add('active');
}

function getRewardColor(type) {
    if (!type) return '#888888';
    const cleanType = type.trim().toUpperCase();
    if (cleanType.includes('가능') || cleanType === 'O' || cleanType === 'Y') return '#70e000'; 
    if (cleanType.includes('불가') || cleanType === 'X' || cleanType === 'N') return '#ff4d4d'; 
    return '#ff9f1c'; 
}

// 6. 실시간 복합 필터 주입 및 렌더링 엔진 스코프
function renderList() {
    const listBody = document.getElementById('achievement-list');
    listBody.innerHTML = '';

    let filtered = [];
    if (!currentSearchQuery) {
        if (currentRewardFilter === 'ALL') {
            filtered = rawData.filter(item => item.main === currentMain);
        } else {
            // 🌟 대분류 변수 파쇄 정책에 힘입어 카테고리에 구애받지 않고 시트 전체 행 중에서 거래여부 일치 대상을 완벽 덤프합니다.
            filtered = rawData.filter(item => item.rewardType === currentRewardFilter);
        }
    } else {
        filtered = rawData.filter(item => {
            return item.name.toLowerCase().includes(currentSearchQuery) || 
                   item.patch.toLowerCase().includes(currentSearchQuery) || 
                   item.condition.toLowerCase().includes(currentSearchQuery) || 
                   item.rewardType.toLowerCase().includes(currentSearchQuery);
        });
        document.getElementById('current-path-display').textContent = `🔍 전체 도감 내 '${currentSearchQuery}' 검색 결과 (총 ${filtered.length}건)`;
    }

    if (currentStatusFilter === 'UNCOMPLETED') {
        filtered = filtered.filter(item => !checkedItems[item.id]); 
    } else if (currentStatusFilter === 'COMPLETED') {
        filtered = filtered.filter(item => checkedItems[item.id]);  
    }

    if (filtered.length === 0) {
        listBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: #888;">조건에 맞는 아이템이 존재하지 않습니다.</td></tr>`;
        calculateChapterProgress([]);
        return;
    }

    filtered.forEach((item, idx) => {
        const tr = document.createElement('tr');
        const isChecked = checkedItems[item.id] ? 'checked' : '';
        if(isChecked) tr.classList.add('completed');

        const textColor = getRewardColor(item.rewardType);
        
        // 🌟 [CORS 완전 우회 바이패스 최적화 엔코딩 단독 주입]
        let finalIconUrl = '';
        if (item.icon) {
            // 로드스톤 전용 특수 경로 파라미터가 유실되거나 인코딩이 깨져 주소가 폭파되지 않도록, 원본 문자열 주소를 다이렉트로 결합합니다.
            finalIconUrl = "https://weserv.nl" + encodeURIComponent(item.icon);
        }
        const iconTag = finalIconUrl ? `<img src="${finalIconUrl}" alt="아이콘" style="width: 32px; height: 32px; object-fit: contain; vertical-align: middle; border-radius: 4px;">` : '';

        tr.innerHTML = `
            <td class="col-no">${idx + 1}</td> 
            <td class="col-check"><input type="checkbox" ${isChecked} onchange="toggleItem('${item.id}', this)"></td>
            <td class="col-icon" style="text-align: center; padding: 4px;">${iconTag}</td>
            <td class="col-name">${item.name}</td>
            <td class="col-cond">${item.patch}</td>
            <td class="col-score">${item.condition || '-'}</td>
            <td class="col-rw-type" style="color: ${textColor}; font-weight: bold;">${item.rewardType || '-'}</td>
        `;
        listBody.appendChild(tr);
    });
    calculateChapterProgress(filtered);
}

// 7. 보유 상태 변경 감지 세이브 핸들러
function toggleItem(id, checkbox) {
    const row = checkbox.closest('tr');
    if (checkbox.checked) {
        checkedItems[id] = true;
        row.classList.add('completed');
    } else {
        delete checkedItems[id];
        row.classList.remove('completed');
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(checkedItems));
    calculateTotalProgress();

    if (currentStatusFilter !== 'ALL' || currentSearchQuery) {
        renderList();
    } else {
        let currentViewItems = [];
        if (currentRewardFilter === 'ALL') {
            currentViewItems = rawData.filter(item => item.main === currentMain);
        } else {
            currentViewItems = rawData.filter(item => item.rewardType === currentRewardFilter);
        }
        calculateChapterProgress(currentViewItems);
    }
}

// 8. 대시보드 실시간 아이템 보유 백분율 연산 통계 싱크
function calculateTotalProgress() {
    const total = rawData.length;
    if(total === 0) return;
    
    const checkedCount = rawData.filter(item => checkedItems[item.id]).length;
    const percent = Math.round((checkedCount / total) * 100);

    document.getElementById('total-percent').textContent = `${percent}%`;
    document.getElementById('total-count').textContent = `${checkedCount}/${total}`;
    document.getElementById('total-bar').style.width = `${percent}%`;

    document.getElementById('score-total').textContent = checkedCount.toLocaleString();
    document.getElementById('score-max').textContent = total.toLocaleString();
    document.getElementById('score-bar').style.width = `${percent}%`;
}

function calculateChapterProgress(currentItems) {
    const total = currentItems.length;
    if (currentSearchQuery) {
        document.getElementById('chapter-percent').parentElement.firstChild.textContent = "검색 아이템 보유율: ";
    } else if (currentRewardFilter !== 'ALL') {
        document.getElementById('chapter-percent').parentElement.firstChild.textContent = "선택 필터 아이템 보유율: ";
    } else {
        document.getElementById('chapter-percent').parentElement.firstChild.textContent = "현재 분류 아이템 보유율: ";
    }

    if(total === 0) {
        document.getElementById('chapter-percent').textContent = `0%`;
        document.getElementById('chapter-count').textContent = `0/0`;
        document.getElementById('chapter-bar').style.width = `0%`;
        return;
    }
    const checkedCount = currentItems.filter(item => checkedItems[item.id]).length;
    const percent = Math.round((checkedCount / total) * 100);

    document.getElementById('chapter-percent').textContent = `${percent}%`;
    document.getElementById('chapter-count').textContent = `${checkedCount}/${total}`;
    document.getElementById('chapter-bar').style.width = `${percent}%`;
}

// 비동기 엔진 기동
fetchData();
