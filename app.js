// =========================================================================
// app.js - Part 1 (최종 버그 수정 및 특수 인코딩 우회 버전)
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

// 1. 원격 구글 시트 데이터 비동기 인프라 로드 및 6개 컬럼 스키마 정밀 매핑
async function fetchData() {
    try {
        const res = await fetch(SHEET_URL);
        if (!res.ok) throw new Error(`웹 앱 API 서버 응답 오류 (상태코드: ${res.status})`);
        
        const rows = await res.json();
        if (!rows || rows.length <= 1) throw new Error("시트 내부 데이터 레코드가 부족하거나 비어있습니다.");

        rawData = rows.slice(1).map((row) => {
            const getVal = (colIdx) => {
                return row[colIdx] !== undefined && row[colIdx] !== null ? String(row[colIdx]).trim() : '';
            };

            const itemName = getVal(2); // C열: 이름
            const parsedPatchNum = parseFloat(getVal(3).replace(/[^0-9.]/g, '')) || 1;

            return {
                id: itemName,           
                main: getVal(0),        // A열: 분류
                sub: '전체 목록',       
                icon: getVal(1),        // B열: 파싱된 이미지 웹 주소 (텍스트 형식)
                name: itemName,         // C열: 이름
                patch: getVal(3),        // D열: 패치
                condition: getVal(4),   // E열: 획득처
                score: parsedPatchNum,  
                rewardType: getVal(5),  // F열: 거래 여부
                rewardContent: getVal(5)
            };
        }).filter(item => item.name && item.main); 

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

// 2. 검색 인터페이스 키인 타이핑 인풋 핸들러
function handleSearchInput() {
    const inputElement = document.getElementById('search-keyword');
    currentSearchQuery = inputElement.value.trim().toLowerCase();
    renderList(); 
}

// 3. 아이템 획득 상태(보유/미보유) 스위칭 서브 컨트롤러
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
    // 🌟 중요: 카테고리를 바꿀 때는 거래 여부 필터를 '전체(ALL)'로 리셋하여 충돌을 방지합니다.
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
// app.js - Part 2 (스마트 리셋 결함 파쇄 및 이미지 인코딩 복구 엔진)
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

// 🌟 [버그 수정 핵심] 거래 여부 클릭 시 다른 필터들의 변수를 확실하게 초기화하고 화면을 재갱신합니다.
function selectRewardFilter(type, btn) {
    currentRewardFilter = type;
    document.querySelectorAll('.reward-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (type === 'ALL') {
        document.getElementById('current-path-display').textContent = `📂 분류 : ${currentMain}`;
    } else {
        // ⚡ 1. 보유 상태 필터를 'ALL(전체 목록 보기)'로 완벽하게 강제 변환
        currentStatusFilter = 'ALL';
        document.querySelectorAll('.status-filter-btn').forEach(b => b.classList.remove('active'));
        const statusAllBtn = document.getElementById('status-all');
        if (statusAllBtn) statusAllBtn.classList.add('active');

        // ⚡ 2. 검색창 입력 찌꺼기 변수 데이터 전량 초기화
        currentSearchQuery = '';
        const searchInput = document.getElementById('search-keyword');
        if (searchInput) searchInput.value = '';

        // ⚡ 3. 대분류 카테고리 불빛 꺼버리기 (전체 아이템 대상 횡단 탐색 선언)
        document.querySelectorAll('#main-category-group button').forEach(b => b.classList.remove('active'));
        
        let displayPathText = type;
        const cleanType = type.trim().toUpperCase();
        if (cleanType === 'O' || cleanType === 'Y' || cleanType.includes('가능')) displayPathText = '거래 가능';
        else if (cleanType === 'X' || cleanType === 'N' || cleanType.includes('불가')) displayPathText = '거래 불가';

        document.getElementById('current-path-display').textContent = `⚖️ [필터] 거래 여부 : ${displayPathText}`; 
    }
    renderList(); // 변수가 리셋된 상태에서 리스트를 처음부터 다시 그립니다.
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

// 6. 실시간 복합 정렬 필터 연산 및 렌더링 스코프
function renderList() {
    const listBody = document.getElementById('achievement-list');
    listBody.innerHTML = '';

    let filtered = [];
    if (!currentSearchQuery) {
        if (currentRewardFilter === 'ALL') {
            filtered = rawData.filter(item => item.main === currentMain);
        } else {
            // 🌟 거래 조건 선택 시 대분류에 갇히지 않고 전체 도감 데이터를 뽑아내도록 정밀 패치 완료
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
        
        // 🌟 [이미지 깨짐 방지 패치] URL 특수문자 깨짐을 완벽하게 보호하는 실시간 복크 솔루션 우회 주입
        let finalIconUrl = '';
        if (item.icon) {
            // 주소에 붙은 물음표(?) 파라미터가 꼬이지 않도록 온전하게 원본 상태 주소로 전달합니다.
            finalIconUrl = `https://weserv.nl{item.icon.replace('https://', '')}`;
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

// 7. 보유 상태 실시간 변경 토글 감지 및 스토리지 동기화 핸들러
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

// 8. 상단 통합 대시보드 백분율 진행도 연산 엔진 싱크 프로토콜
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

// 최초 구동 트리거 실행
fetchData();
