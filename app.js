// =========================================================================
// app.js - Part 1 (G열 거래 여부 데이터 인덱스 번호 정밀 보정 버전)
// =========================================================================
const GOOGLE_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwXU6uSUZE4SY3PpD7I6YtCGivLYEuCqzKvTEyWIoSoVr8Sd8FcfOhlL3UjcYmyp__m/exec';
const SHEET_URL = GOOGLE_WEB_APP_URL; 

let rawData = [];
const STORAGE_KEY = 'game_item_checklist_v3';
let checkedItems = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};

let currentMain = '';            // A열: 카테고리 필터링 타겟
let currentRewardFilter = 'ALL';       // G열: 거래 여부 필터링 타겟
let currentOriginFilter = 'ALL';       // E열: 획득처 필터링 타겟
let currentStatusFilter = 'ALL';       // 보유/미보유 상태 필터 타겟
let currentSearchQuery = ''; 

// 1. 원격 구글 시트 7개 컬럼 데이터 세트 초고속 로드 및 정밀 매핑
async function fetchData() {
    try {
        const res = await fetch(SHEET_URL);
        if (!res.ok) throw new Error(`웹 앱 API 서버 응답 오류 (상태코드: ${res.status})`);
        
        const rows = await res.json();
        if (!rows || rows.length <= 1) throw new Error("시트 내부 데이터 레코드가 부족하거나 비어있습니다.");

        // 🌟 [인덱스 전수조사 매핑 보정]
        // 컴퓨터 번호 부여 체계에 맞춰 (A=0, B=1, C=2, D=3, E=4, F=5, G=6)으로 오차 없이 조율했습니다.
        rawData = rows.slice(1).map((row) => {
            if (!row || !Array.isArray(row)) return null;
            
            const getVal = (colIdx) => {
                return row[colIdx] !== undefined && row[colIdx] !== null ? String(row[colIdx]).trim() : '';
            };

            // 이미지 주소 깨짐 원천봉쇄 자동 색출기 가동
            let detectedIconUrl = '';
            for (let cell of row) {
                const strCell = String(cell).trim();
                const match = strCell.match(/https?:\/\/[^\s"']+/i);
                if (match) {
                    detectedIconUrl = String(match).trim();
                    break;
                }
            }

            const itemName = getVal(2); // 2번 인덱스 = C열 (이름)
            const parsedPatchNum = parseFloat(getVal(3).replace(/[^0-9.]/g, '')) || 1;

            return {
                id: itemName,           
                main: getVal(0),        // 0번 인덱스 = A열 (카테고리)
                sub: '전체 목록',       
                icon: detectedIconUrl,  // B열 바탕 검출 주소
                name: itemName,         
                patch: getVal(3),        // 3번 인덱스 = D열 (패치)
                originPlace: getVal(4),  // 4번 인덱스 = E열 (획득처) 
                condition: getVal(5),   // 5번 인덱스 = F열 (조건)
                score: parsedPatchNum,  
                rewardType: getVal(6),  // 🌟 [보정 완료] 6번 인덱스 = G열 (거래 여부)을 정확히 조준합니다.
                rewardContent: getVal(6)
            };
        }).filter(item => item && item.name && item.main); 

        initMenu();
        initRewardMenu(); 
        initOriginMenu(); 
        calculateTotalProgress();
    } catch (error) {
        console.error(error);
        document.getElementById('achievement-list').innerHTML = `
            <tr><td colspan="8" style="text-align: center; color: #ff4d4d; font-weight: bold; padding: 40px;">
                데이터베이스 연동 실패<br>
                <span style="color: #aaa; font-size: 0.9em; font-weight: normal;">이유: ${error.message}</span>
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
// app.js - Part 2 (양방향 크로스 리셋 및 중복 클릭 감지 자동 토글 해제 스코프)
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
    // 카테고리 전환 시 하위 다중 수집 필터들은 일괄 해제
    currentRewardFilter = 'ALL'; 
    currentOriginFilter = 'ALL';
    updateRewardFilterActive();
    updateOriginFilterActive();

    document.querySelectorAll('#main-category-group button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.getElementById('current-path-display').textContent = `📂 분류 : ${currentMain}`;
    renderList();
}

// 5-1. 거래 여부 필터 구조 빌더
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

// 5-2. 🌟 [신설] E열에 적힌 획득처 종류를 추출하여 동적 버튼 자동 드로잉
function initOriginMenu() {
    const originTypes = [...new Set(rawData.map(item => item.originPlace))].filter(t => t && t !== '-');
    const originGroup = document.getElementById('condition-category-group'); // HTML 타겟 노드 바인딩
    originGroup.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.textContent = '필터 해제';
    allBtn.classList.add('condition-filter-btn', 'active');
    allBtn.id = 'og-btn-all';
    allBtn.onclick = () => selectOriginFilter('ALL', allBtn);
    originGroup.appendChild(allBtn);

    originTypes.forEach(type => {
        const btn = document.createElement('button');
        btn.textContent = type;
        btn.classList.add('condition-filter-btn');
        btn.onclick = () => selectOriginFilter(type, btn);
        originGroup.appendChild(btn);
    });
}

// ⚖️ 거래 여부 제어 및 중복 연쇄 토글 리셋 프로토콜
function selectRewardFilter(type, btn) {
    if (type !== 'ALL' && currentRewardFilter === type) {
        const allBtn = document.getElementById('rw-btn-all');
        if (allBtn) { selectRewardFilter('ALL', allBtn); return; }
    }

    currentRewardFilter = type; 
    document.querySelectorAll('.reward-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // ⚡ 중요: 거래 여부 필터 단독 기동 시 반대편 획득처 필터는 서로 엉키지 않도록 자동 해제
    if (type !== 'ALL') {
        currentOriginFilter = 'ALL';
        updateOriginFilterActive();
        clearCommonBaseFilters();
        document.getElementById('current-path-display').textContent = `⚖️ [필터] 거래 여부 : ${type}`;
    } else {
        restoreDefaultCategory();
    }
    renderList(); 
}

// 🌟 [신설] 획득처 제어 및 중복 연쇄 토글 리셋 프로토콜 (양방향 크로스 스마트 리셋 탑재)
function selectOriginFilter(type, btn) {
    if (type !== 'ALL' && currentOriginFilter === type) {
        const allBtn = document.getElementById('og-btn-all');
        if (allBtn) { selectOriginFilter('ALL', allBtn); return; }
    }

    currentOriginFilter = type;
    document.querySelectorAll('.condition-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // ⚡ 중요: 획득처 필터 단독 기동 시 반대편 거래 여부 필터는 서로 엉키지 않도록 자동 해제
    if (type !== 'ALL') {
        currentRewardFilter = 'ALL';
        updateRewardFilterActive();
        clearCommonBaseFilters();
        document.getElementById('current-path-display').textContent = `🗺️ [필터] 획득처 : ${type}`;
    } else {
        restoreDefaultCategory();
    }
    renderList();
}

// 하이브리드 필터 단독 구동 시 기저 조건부 락 전면 파쇄 매크로
function clearCommonBaseFilters() {
    currentMain = ''; 
    document.querySelectorAll('#main-category-group button').forEach(b => b.classList.remove('active'));
    currentStatusFilter = 'ALL';
    document.querySelectorAll('.status-filter-btn').forEach(b => b.classList.remove('active'));
    const statusAllBtn = document.getElementById('status-all');
    if (statusAllBtn) statusAllBtn.classList.add('active');
    currentSearchQuery = '';
    const searchInput = document.getElementById('search-keyword');
    if (searchInput) searchInput.value = '';
}

function restoreDefaultCategory() {
    if (currentRewardFilter === 'ALL' && currentOriginFilter === 'ALL') {
        const activeMainBtn = document.querySelector('#main-category-group button.active');
        if (activeMainBtn) {
            currentMain = activeMainBtn.textContent;
            document.getElementById('current-path-display').textContent = `📂 분류 : ${currentMain}`;
        } else {
            const firstMainBtn = document.querySelector('#main-category-group button');
            if (firstMainBtn) firstMainBtn.click();
        }
    }
}

function updateRewardFilterActive() {
    document.querySelectorAll('.reward-filter-btn').forEach(b => b.classList.remove('active'));
    const allBtn = document.getElementById('rw-btn-all');
    if(allBtn) allBtn.classList.add('active');
}

function updateOriginFilterActive() {
    document.querySelectorAll('.condition-filter-btn').forEach(b => b.classList.remove('active'));
    const allBtn = document.getElementById('og-btn-all');
    if(allBtn) allBtn.classList.add('active');
}
// =========================================================================
// app.js - Part 3 (8개 확장 열 실시간 렌더링 주입 및 대시보드 진행도 싱크)
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

// 6. 실시간 복합 필터 주입 및 8열 정밀 렌더링 엔진 스코프
function renderList() {
    const listBody = document.getElementById('achievement-list');
    listBody.innerHTML = '';

    let filtered = [];
    if (!currentSearchQuery) {
        if (currentRewardFilter === 'ALL' && currentOriginFilter === 'ALL') {
            filtered = rawData.filter(item => item.main === currentMain);
        } else if (currentRewardFilter !== 'ALL') {
            filtered = rawData.filter(item => {
                if (currentRewardFilter === '거래 가능') return isTradeable(item.rewardType);
                if (currentRewardFilter === '거래 불가') return isNotTradeable(item.rewardType);
                return true;
            });
        } else if (currentOriginFilter !== 'ALL') {
            // 🌟 획득처 종류 동적 추출 연산 타겟 선별
            filtered = rawData.filter(item => item.originPlace === currentOriginFilter);
        }
    } else {
        filtered = rawData.filter(item => {
            return item.name.toLowerCase().includes(currentSearchQuery) || 
                   item.patch.toLowerCase().includes(currentSearchQuery) || 
                   item.originPlace.toLowerCase().includes(currentSearchQuery) || 
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
        listBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 40px; color: #888;">조건에 맞는 아이템이 존재하지 않습니다.</td></tr>`;
        calculateChapterProgress([]);
        return;
    }

    filtered.forEach((item, idx) => {
        const tr = document.createElement('tr');
        const isChecked = checkedItems[item.id] ? 'checked' : '';
        if(isChecked) tr.classList.add('completed');

        const textColor = getRewardColor(item.rewardType);
        
        // 🌟 [보안 장벽 원천 파쇄 100% 완전 출력 기조 준수]
        const originalIconUrl = item.icon ? item.icon.trim() : '';
        const iconTag = originalIconUrl ? `<img src="${originalIconUrl}" referrerpolicy="no-referrer" alt="아이콘" style="width: 32px; height: 32px; object-fit: contain; vertical-align: middle; border-radius: 4px;">` : '';

        let tableTradeText = item.rewardType || '-';
        if (isTradeable(item.rewardType)) tableTradeText = '거래 가능';
        else if (isNotTradeable(item.rewardType)) tableTradeText = '거래 불가';

        // 번호, 보유, 아이콘, 이름, 패치, 획득처, 조건, 거래여부 총 8열 마크업 완벽 매핑 주입 🌟
        tr.innerHTML = `
            <td class="col-no">${idx + 1}</td> 
            <td class="col-check"><input type="checkbox" ${isChecked} onchange="toggleItem('${item.id}', this)"></td>
            <td class="col-icon" style="text-align: center; padding: 4px;">${iconTag}</td>
            <td class="col-name">${item.name}</td>
            <td class="col-cond">${item.patch}</td>
            <td class="col-type" style="color: #ff9f1c; font-weight: bold;">${item.originPlace || '-'}</td>
            <td class="col-score">${item.condition || '-'}</td>
            <td class="col-rw-type" style="color: ${textColor}; font-weight: bold;">${tableTradeText}</td>
        `;
        listBody.appendChild(tr);
    });
    calculateChapterProgress(filtered);
}

// 7. 보유 상태 실시간 스토리지 플러시 핸들러
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
        if (currentRewardFilter === 'ALL' && currentOriginFilter === 'ALL') {
            currentViewItems = rawData.filter(item => item.main === currentMain);
        } else if (currentRewardFilter !== 'ALL') {
            currentViewItems = rawData.filter(item => {
                if (currentRewardFilter === '거래 가능') return isTradeable(item.rewardType);
                if (currentRewardFilter === '거래 불가') return isNotTradeable(item.rewardType);
                return true;
            });
        } else if (currentOriginFilter !== 'ALL') {
            currentViewItems = rawData.filter(item => item.originPlace === currentOriginFilter);
        }
        calculateChapterProgress(currentViewItems);
    }
}

// 8. 대시보드 백분율 통계 엔진 싱크
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
    } else if (currentRewardFilter !== 'ALL' || currentOriginFilter !== 'ALL') {
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

// 비동기 엔진 가동 점화
fetchData();
