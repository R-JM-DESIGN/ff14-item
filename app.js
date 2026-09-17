// app.js - Part 1
// 🌟 사용자님의 실제 구글 웹 앱 주소를 최상단에 고정하여 CORS 우회 연동을 지원합니다.
const GOOGLE_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxzHJ7pYhEJXYQseJxmYAogVnL5EDRnSU0RD1_IBCILBNkihy6usAmUqGGVrXzOzlQm/exec';
const SHEET_URL = GOOGLE_WEB_APP_URL; 

let rawData = [];
// 기존 FF14 업적 스토리지 키와 분리된 고유의 로컬 스토리지 데이터베이스 키 고정
const STORAGE_KEY = 'game_item_checklist_v3';
let checkedItems = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};

let currentMain = '';            // A열: 분류 필터링 타겟
let currentRewardFilter = 'ALL';       // F열: 장게 여부 필터링 타겟
let currentStatusFilter = 'ALL';       // 보유/미보유 상태 필터
let currentSearchQuery = ''; 

// 1. 앱스 스크립트 이미지 파싱 스트림을 우회 경유하여 데이터 세트 로드
async function fetchData() {
    try {
        const res = await fetch(SHEET_URL);
        if (!res.ok) throw new Error(`웹 앱 API 서버 응답 오류 (상태코드: ${res.status})`);
        
        const rows = await res.json();
        if (!rows || rows.length <= 1) throw new Error("시트 내부 데이터 레코드가 부족하거나 비어있습니다.");

        // 스키마 순서: A분류 / B아이콘(URL) / C이름 / D패치 / E획득처 / F장게여부
        rawData = rows.slice(1).map((row) => {
            const getVal = (colIdx) => {
                return row[colIdx] !== undefined && row[colIdx] !== null ? String(row[colIdx]).trim() : '';
            };

            const itemName = getVal(2); // C열: 이름
            // D열 패치 명칭 정보(예: v6.5, 7.0)에서 연산용 실수/정수 가중치 분리 파싱
            const parsedPatchNum = parseFloat(getVal(3).replace(/[^0-9.]/g, '')) || 1;

            return {
                id: itemName,           // 아이템 이름을 변동 없는 고유 체크 키값으로 고정
                main: getVal(0),        // A열: 분류
                sub: '전체 목록',       // UI 호환 유지를 위한 가상 싱글 서브 카테고리 트리 매핑
                icon: getVal(1),        // B열: 파싱된 셀 내 이미지 웹 주소
                name: itemName,         // C열: 이름
                patch: getVal(3),        // D열: 패치 버전
                condition: getVal(4),   // E열: 획득처 및 조건
                score: parsedPatchNum,  // 게이지 바 컴포넌트 하이라이트 동적 싱크용 수치 데이터 
                rewardType: getVal(5),  // F열: 장게 여부 (필터 스위치로 우회 가공)
                rewardContent: getVal(5)// 레이아웃 호환용 서브 밸류 복사
            };
        }).filter(item => item.name && item.main); 

        initMenu();
        initRewardMenu(); 
        calculateTotalProgress();
    } catch (error) {
        console.error(error);
        // 사용자 요청 사양에 맞추어 깔끔하게 에러 디스플레이 가이드 문구 출력
        document.getElementById('achievement-list').innerHTML = `
            <tr><td colspan="7" style="text-align: center; color: #ff4d4d; font-weight: bold; padding: 40px;">
                데이터베이스 연동 및 로드 과정에 오류가 발생했습니다.<br>
                <span style="color: #aaa; font-size: 0.9em; font-weight: normal;">원인: ${error.message}</span>
            </td></tr>`;
    }
}

// 2. 검색 인터페이스 키인 핸들러
function handleSearchInput() {
    const inputElement = document.getElementById('search-keyword');
    currentSearchQuery = inputElement.value.trim().toLowerCase();
    renderList(); // 인풋이 변동될 때마다 즉시 가상 돔 필터 렌더링 스코프 실행
}

// 3. 획득 상태 스위칭 서브 컨트롤러
function selectStatusFilter(status) {
    currentStatusFilter = status;
    
    document.querySelectorAll('.status-filter-btn').forEach(btn => btn.classList.remove('active'));
    if(status === 'ALL') document.getElementById('status-all').classList.add('active');
    if(status === 'UNCOMPLETED') document.getElementById('status-uncompleted').classList.add('active');
    if(status === 'COMPLETED') document.getElementById('status-completed').classList.add('active');

    renderList();
}

// 4. 대분류 카테고리(A열) 최적화 동적 생성 노드 빌더
function initMenu() {
    const mains = [...new Set(rawData.map(item => item.main))];
    const mainGroup = document.getElementById('main-category-group');
    mainGroup.innerHTML = '';

    mains.forEach((main, idx) => {
        if(!main) return;
        const btn = document.createElement('button');
        btn.textContent = main;
        btn.onclick = () => selectMainCategory(main, btn);
        if(idx === 0) btn.click(); // 최초 첫 번째 대분류 노드 버튼 자동 호출
        mainGroup.appendChild(btn);
    });
}

function selectMainCategory(main, btn) {
    currentMain = main;
    currentRewardFilter = 'ALL'; 
    updateRewardFilterActive();

    document.querySelectorAll('#main-category-group button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // 숨겨진 소분류 영역 버블링 방지 플레이스홀더 싱크 제어
    const subGroup = document.getElementById('sub-category-group');
    subGroup.innerHTML = '';
    const sBtn = document.createElement('button');
    sBtn.textContent = '전체 아이템 도감';
    sBtn.classList.add('active');
    subGroup.appendChild(sBtn);

    document.getElementById('current-path-display').textContent = `📂 분류 : ${currentMain}`;
    renderList();
}
// app.js - Part 2

// 5. 장터게시판 거래 가능 상태(F열) 수집형 필터 스위치 바인딩
function initRewardMenu() {
    const rewardTypes = [...new Set(rawData.map(item => item.rewardType))].filter(t => t && t !== '-');
    const rewardGroup = document.getElementById('reward-category-group');
    rewardGroup.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.textContent = '장게 여부: 전체'; 
    allBtn.classList.add('reward-filter-btn', 'active');
    allBtn.id = 'rw-btn-all';
    allBtn.onclick = () => selectRewardFilter('ALL', allBtn);
    rewardGroup.appendChild(allBtn);

    rewardTypes.forEach(type => {
        const btn = document.createElement('button');
        btn.textContent = `장게: ${type}`; 
        btn.classList.add('reward-filter-btn');
        btn.onclick = () => selectRewardFilter(type, btn);
        rewardGroup.appendChild(btn);
    });
}

function selectRewardFilter(type, btn) {
    currentRewardFilter = type;
    
    document.querySelectorAll('.reward-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (type === 'ALL') {
        document.getElementById('current-path-display').textContent = `📂 분류 : ${currentMain}`;
    } else {
        document.querySelectorAll('#main-category-group button').forEach(b => b.classList.remove('active'));
        document.getElementById('current-path-display').textContent = `⚖️ [필터] 장터게시판 거래 여부 : ${type}`; 
    }
    renderList();
}

function updateRewardFilterActive() {
    document.querySelectorAll('.reward-filter-btn').forEach(b => b.classList.remove('active'));
    const allBtn = document.getElementById('rw-btn-all');
    if(allBtn) allBtn.classList.add('active');
}

// 인게임 장게 거래 상태 성격별 유동적 텍스트 색상 분기 처리 가이드
function getRewardColor(type) {
    if (!type) return '#888888';
    const cleanType = type.trim();
    if (cleanType.includes('가능') || cleanType === 'O' || cleanType === 'Y') return '#70e000'; // 라이트/다크 호환 수용성 초록
    if (cleanType.includes('불가') || cleanType === 'X' || cleanType === 'N') return '#ff4d4d'; // 주의/경고용 유동 레드
    return '#ff9f1c'; // 기타 속성용 오렌지
}

// 6. 복합 조건문 정렬 알고리즘 및 6개 컬럼 테이블 마크업 동적 주입 프로토콜
function renderList() {
    const listBody = document.getElementById('achievement-list');
    listBody.innerHTML = '';

    let filtered = [];
    
    if (!currentSearchQuery) {
        if (currentRewardFilter === 'ALL') {
            filtered = rawData.filter(item => item.main === currentMain);
        } else {
            filtered = rawData.filter(item => item.rewardType === currentRewardFilter);
        }
    } else {
        filtered = rawData.filter(item => {
            const nameMatch = item.name.toLowerCase().includes(currentSearchQuery);
            const patchMatch = item.patch.toLowerCase().includes(currentSearchQuery);
            const condMatch = item.condition.toLowerCase().includes(currentSearchQuery);
            const typeMatch = item.rewardType.toLowerCase().includes(currentSearchQuery);
            return nameMatch || patchMatch || condMatch || typeMatch;
        });
        
        document.getElementById('current-path-display').textContent = `🔍 전체 도감 내 '${currentSearchQuery}' 검색 결과 (총 ${filtered.length}건)`;
    }

    if (currentStatusFilter === 'UNCOMPLETED') {
        filtered = filtered.filter(item => !checkedItems[item.id]); 
    } else if (currentStatusFilter === 'COMPLETED') {
        filtered = filtered.filter(item => checkedItems[item.id]);  
    }

    if (filtered.length === 0) {
        listBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: #888;">조건 및 검색 상태에 부합하는 아이템이 존재하지 않습니다.</td></tr>`;
        calculateChapterProgress([]);
        return;
    }

    filtered.forEach((item, idx) => {
        const tr = document.createElement('tr');
        const isChecked = checkedItems[item.id] ? 'checked' : '';
        if(isChecked) tr.classList.add('completed');

        const textColor = getRewardColor(item.rewardType);
        
        // B열 아이콘 데이터를 이미지 요소 규격에 맞게 매핑 가공
        const iconTag = item.icon ? `<img src="${item.icon}" alt="아이콘" style="width: 32px; height: 32px; object-fit: contain; vertical-align: middle; border-radius: 4px;">` : '';

        // 정밀 디자인 뼈대 규격 7열 바인딩 (번호 / 체크박스 / 아이콘 이미지 / 이름 / 패치 / 획득처 / 거래여부)
        tr.innerHTML = `
            <td class="col-no">${idx + 1}</td> 
            <td class="col-check"><input type="checkbox" ${isChecked} onchange="toggleItem('${item.id}', this)"></td>
            <td class="col-icon" style="text-align: center; padding: 4px;">${iconTag}</td>
            <td class="col-name">${item.name}</td>
            <td class="col-cond" style="color: #4ea8de;">${item.patch}</td>
            <td class="col-score">${item.condition || '-'}</td>
            <td class="col-rw-type" style="color: ${textColor}; font-weight: bold;">${item.rewardType || '-'}</td>
        `;
        listBody.appendChild(tr);
    });

    calculateChapterProgress(filtered);
}

// 7. 보유 변경 내역 실시간 저장 및 런타임 수집 차트 업데이트 프로세스
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

// 8. 대시보드 실시간 아이템 보유 카운트 백분율 분석 싱크
function calculateTotalProgress() {
    const total = rawData.length;
    if(total === 0) return;
    
    const checkedCount = rawData.filter(item => checkedItems[item.id]).length;
    const percent = Math.round((checkedCount / total) * 100);

    document.getElementById('total-percent').textContent = `${percent}%`;
    document.getElementById('total-count').textContent = `${checkedCount}/${total}`;
    document.getElementById('total-bar').style.width = `${percent}%`;

    // 인라인 은닉 보정 홀더 데이터 동기화 연산 백업
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

// 초기 구동 비동기 트리거 가동
fetchData();
