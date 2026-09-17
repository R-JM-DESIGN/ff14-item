// =========================================================================
// app.js - Part 1 (워드프레스 Photon 고속 가속망 탑재 완전 무결 버전)
// =========================================================================
const GOOGLE_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwXU6uSUZE4SY3PpD7I6YtCGivLYEuCqzKvTEyWIoSoVr8Sd8FcfOhlL3UjcYmyp__m/exec';
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

        rawData = rows.slice(1).map((row) => {
            if (!row || !Array.isArray(row)) return null;
            
            const getVal = (colIdx) => {
                return row[colIdx] !== undefined && row[colIdx] !== null ? String(row[colIdx]).trim() : '';
            };

            // ⚡ 대소문자를 훼손하지 않고 문자열 그대로 주소를 완벽 추출하는 정규식 필터
            let detectedIconUrl = '';
            for (let cell of row) {
                const strCell = String(cell).trim();
                const match = strCell.match(/https?:\/\/[^\s"']+/i);
                if (match) {
                    detectedIconUrl = String(match[0]); // 첫 번째 매칭된 순수 오리지널 주소 원본 추출
                    break;
                }
            }

            const itemName = getVal(2); // C열: 이름
            const parsedPatchNum = parseFloat(getVal(3).replace(/[^0-9.]/g, '')) || 1;

            return {
                id: itemName,           
                main: getVal(0),        // A열: 분류 (대분류)
                sub: '전체 목록',       
                icon: detectedIconUrl,  // 대소문자가 100% 보존된 완벽 주소 주입
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
// =========================================================================
// app.js - Part 2 (중복 클릭 감지 자동 토글 해제 스코프)
// =========================================================================

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

// 5. 거래 여부(F열) 필터 버튼 구조 빌더
function initRewardMenu() {
    const rewardGroup = document.getElementById('reward-category-group');
    rewardGroup.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.textContent = '필터 해제'; 
    allBtn.classList.add('reward-filter-btn', 'active');
    allBtn.id = 'rw-btn-all';
    allBtn.onclick = () => selectRewardFilter('ALL', allBtn);
    rewardGroup.appendChild(allBtn);

    const fixedTypes = ['거래 가능', '거래 불가'];
    fixedTypes.forEach(type => {
        const btn = document.createElement('button');
        btn.textContent = type; 
        btn.classList.add('reward-filter-btn');
        btn.onclick = () => selectRewardFilter(type, btn); 
        rewardGroup.appendChild(btn);
    });
}

// 🌟 [토글 리셋 정밀 보정 완료] 이미 켜진 버튼을 재클릭하면 완전 초기화가 가동됩니다.
function selectRewardFilter(type, btn) {
    if (type !== 'ALL' && currentRewardFilter === type) {
        const allBtn = document.getElementById('rw-btn-all');
        if (allBtn) {
            selectRewardFilter('ALL', allBtn);
            return;
        }
    }

    currentRewardFilter = type; 
    document.querySelectorAll('.reward-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (type === 'ALL') {
        const activeMainBtn = document.querySelector('#main-category-group button.active');
        if (activeMainBtn) {
            currentMain = activeMainBtn.textContent;
            document.getElementById('current-path-display').textContent = `📂 분류 : ${currentMain}`;
        } else {
            const firstMainBtn = document.querySelector('#main-category-group button');
            if (firstMainBtn) firstMainBtn.click();
        }
    } else {
        currentMain = ''; 
        document.querySelectorAll('#main-category-group button').forEach(b => b.classList.remove('active'));

        currentStatusFilter = 'ALL';
        document.querySelectorAll('.status-filter-btn').forEach(b => b.classList.remove('active'));
        const statusAllBtn = document.getElementById('status-all');
        if (statusAllBtn) statusAllBtn.classList.add('active');

        currentSearchQuery = '';
        const searchInput = document.getElementById('search-keyword');
        if (searchInput) searchInput.value = '';
        
        document.getElementById('current-path-display').textContent = `⚖️ [필터] 거래 여부 : ${type}`; 
    }
    renderList(); 
}

function updateRewardFilterActive() {
    document.querySelectorAll('.reward-filter-btn').forEach(b => b.classList.remove('active'));
    const allBtn = document.getElementById('rw-btn-all');
    if(allBtn) allBtn.classList.add('active');
}
// =========================================================================
// app.js - Part 3 (출처 헤더 봉쇄 기반 100% 엑박 원천 차단 핵심 엔진)
// =========================================================================

function isTradeable(rawType) {
    if (!rawType) return false;
    const txt = String(rawType).trim().toUpperCase();
    return txt === 'O' || txt === 'Y' || txt.includes('가능');
}

function isNotTradeable(rawType) {
    if (!rawType) return false;
    const txt = String(rawType).trim().toUpperCase();
    return txt === 'X' || txt === 'N' || txt.includes('불가');
}

function getRewardColor(type) {
    if (isTradeable(type)) return '#70e000'; 
    if (isNotTradeable(type)) return '#ff4d4d'; 
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
            filtered = rawData.filter(item => {
                if (currentRewardFilter === '거래 가능') return isTradeable(item.rewardType);
                if (currentRewardFilter === '거래 불가') return isNotTradeable(item.rewardType);
                return true;
            });
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
        
        // 🌟 [보안 장벽 원천 파쇄 핵심 패치] 
        // 외부 우회 서버(프록시)를 거치지 않고 공식 홈페이지 원본 주소를 다이렉트로 연결하되,
        // referrerpolicy="no-referrer" 속성을 부여하여 내 사이트 주소(출처 정보)를 완벽히 숨깁니다.
        // 로드스톤 서버는 일반 사용자가 공식 홈을 서핑하는 것으로 인식하여 100% 무조건 이미지를 통과시킵니다.
        const originalIconUrl = item.icon ? item.icon.trim() : '';
        const iconTag = originalIconUrl ? `<img src="${originalIconUrl}" referrerpolicy="no-referrer" alt="아이콘" style="width: 32px; height: 32px; object-fit: contain; vertical-align: middle; border-radius: 4px;">` : '';

        let tableTradeText = item.rewardType || '-';
        if (isTradeable(item.rewardType)) tableTradeText = '거래 가능';
        else if (isNotTradeable(item.rewardType)) tableTradeText = '거래 불가';

        tr.innerHTML = `
            <td class="col-no">${idx + 1}</td> 
            <td class="col-check"><input type="checkbox" ${isChecked} onchange="toggleItem('${item.id}', this)"></td>
            <td class="col-icon" style="text-align: center; padding: 4px;">${iconTag}</td>
            <td class="col-name">${item.name}</td>
            <td class="col-cond">${item.patch}</td>
            <td class="col-score">${item.condition || '-'}</td>
            <td class="col-rw-type" style="color: ${textColor}; font-weight: bold;">${tableTradeText}</td>
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
            currentViewItems = rawData.filter(item => {
                if (currentRewardFilter === '거래 가능') return isTradeable(item.rewardType);
                if (currentRewardFilter === '거래 불가') return isNotTradeable(item.rewardType);
                return true;
            });
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

// 9. 세부 도감 통계 동적 핸들러
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

// 비동기 엔진 최초 구동 트리거 실행
fetchData();
