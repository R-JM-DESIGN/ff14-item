// =========================================================================
// app.js - Part 1 (7개 열 확장 스키마 수집 및 이미지 원천 파쇄 보호망)
// 🌟 사용자님의 구글 웹 앱 API 주소를 상단에 고정하여 초고속 연동을 지원합니다.
// =========================================================================
const GOOGLE_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycby_Cb18OxVCoIUgdc6p0tZ75nZEXtXBWoS-4Vms5Aly8pq_QIFkB4SzBZzMj0e7av7V/exec';
const SHEET_URL = GOOGLE_WEB_APP_URL; 

let rawData = [];
const STORAGE_KEY = 'game_item_checklist_v3';
let checkedItems = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};

let currentMain = '';            // A열: 카테고리 필터링 타겟
let currentRewardFilter = 'ALL';       // G열: 거래 여부 필터링 타겟
let currentOriginFilter = 'ALL';       // E열: 획득처 필터링 타겟
let currentStatusFilter = 'ALL';       // 보유/미보유 상태 필터 타겟
let currentSortOrder = 'DESC';         // 패치 및 획득처 통합 정렬 변수 (기본값: 최신순 DESC)
let currentSearchQuery = ''; 

// 1. 원격 구글 시트 7개 컬럼 데이터 세트 초고속 로드 및 정밀 매핑
async function fetchData() {
    try {
        const res = await fetch(SHEET_URL);
        if (!res.ok) throw new Error(`웹 앱 API 서버 응답 오류 (상태코드: ${res.status})`);
        
        const rows = await res.json();
        if (!rows || rows.length <= 1) throw new Error("시트 내부 데이터 레코드가 부족하거나 비어있습니다.");

        // 컴퓨터 인덱스 규칙 고정: A=0, B=1, C=2, D=3, E=4, F=5, G=6
        rawData = rows.slice(1).map((row) => {
            if (!row || !Array.isArray(row)) return null;
            
            const getVal = (colIdx) => {
                return row[colIdx] !== undefined && row[colIdx] !== null ? String(row[colIdx]).trim() : '';
            };

            // 이미지 주소 깨짐 원천봉쇄 공식 라인 색출기 가동
            let detectedIconUrl = '';
            for (let cell of row) {
                const strCell = String(cell).trim();
                const match = strCell.match(/https?:\/\/[^\s"']+/i);
                if (match) {
                    detectedIconUrl = String(match).trim();
                    break;
                }
            }

            const itemName = getVal(2); // C열: 이름
            const parsedPatchNum = parseFloat(getVal(3).replace(/[^0-9.]/g, '')) || 0.0;

            return {
                id: itemName,           
                main: getVal(0),        // A열: 카테고리 선택
                sub: '전체 목록',       
                icon: detectedIconUrl,  // B열: 아이콘 원본 주소
                name: itemName,         // C열: 이름
                patch: getVal(3),        // D열: 패치
                originPlace: getVal(4),  // E열: 획득처
                condition: getVal(5),   // F열: 조건 상세 설명 문구
                patchValue: parsedPatchNum, 
                rewardType: getVal(6),  // G열: 거래 여부 데이터
                rewardContent: getVal(6)
            };
        }).filter(item => item && item.name && item.main); 

        initMenu();
        initRewardMenu(); 
        initOriginDropdown(); // 획득처 드롭다운 옵션 빌더 기동
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
// app.js - Part 2 (다중 정렬 분기 및 스마트 양방향 크로스 리셋 시스템)
// =========================================================================

// 사용자가 지정한 정렬 타입에 맞춰 클래스 활성화 불빛을 제어하고 연산을 수행합니다.
function selectSortOrder(order) {
    currentSortOrder = order;
    document.querySelectorAll('.sort-filter-btn').forEach(btn => btn.classList.remove('active'));
    
    if (order === 'ASC') document.getElementById('sort-asc').classList.add('active');
    if (order === 'DESC') document.getElementById('sort-desc').classList.add('active');
    if (order === 'ORIGIN_ASC') document.getElementById('sort-origin-asc').classList.add('active');
    if (order === 'ORIGIN_DESC') document.getElementById('sort-origin-desc').classList.add('active');
    
    renderList();
}

// 카테고리 선택(A열 분류) 동적 HTML 노드 버튼 빌더
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
    currentOriginFilter = 'ALL';
    updateRewardFilterActive();
    resetOriginDropdownUI(); 

    document.querySelectorAll('#main-category-group button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.getElementById('current-path-display').textContent = `📂 분류 : ${currentMain}`;
    renderList();
}

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

// E열의 획득처 종류를 중복 없이 추출하여 HTML <select> 박스 안에 옵션 자동 주입
function initOriginDropdown() {
    const originTypes = [...new Set(rawData.map(item => item.originPlace))].filter(t => t && t !== '-');
    const dropdown = document.getElementById('condition-dropdown-filter');
    
    dropdown.innerHTML = '<option value="ALL">전체 보기 (필터 해제)</option>';
    
    originTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        dropdown.appendChild(option);
    });
}

function selectRewardFilter(type, btn) {
    if (type !== 'ALL' && currentRewardFilter === type) {
        const allBtn = document.getElementById('rw-btn-all');
        if (allBtn) { selectRewardFilter('ALL', allBtn); return; }
    }

    currentRewardFilter = type; 
    document.querySelectorAll('.reward-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (type !== 'ALL') {
        currentOriginFilter = 'ALL';
        resetOriginDropdownUI();
        clearCommonBaseFilters();
        document.getElementById('current-path-display').textContent = `⚖️ [필터] 거래 여부 : ${type}`;
    } else {
        restoreDefaultCategory();
    }
    renderList(); 
}

function handleOriginDropdownChange(selectElement) {
    const selectedValue = selectElement.value;
    currentOriginFilter = selectedValue;

    if (selectedValue !== 'ALL') {
        currentRewardFilter = 'ALL';
        updateRewardFilterActive();
        clearCommonBaseFilters();
        document.getElementById('current-path-display').textContent = `🗺️ [필터] 획득처 : ${selectedValue}`;
    } else {
        restoreDefaultCategory();
    }
    renderList();
}

// 원터치 초기화 매커니즘 연동: 초기화 버튼 클릭 시 획득처 필터를 깨끗하게 원격 클리어
function clearOriginDropdownFilter() {
    if (currentOriginFilter === 'ALL') return;
    
    currentOriginFilter = 'ALL';
    resetOriginDropdownUI();
    restoreDefaultCategory();
    renderList();
}

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

function resetOriginDropdownUI() {
    const dropdown = document.getElementById('condition-dropdown-filter');
    if (dropdown) dropdown.value = 'ALL';
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
    return '#888888'; 
}

// 실시간 복합 필터 주입 및 8열 정밀 렌더링 엔진 스코프
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

    // 통합 복합 정렬 분기 수행 (패치 버전 숫자 정렬 또는 획득처 가나다순 정렬)
    filtered.sort((a, b) => {
        if (currentSortOrder === 'ASC') {
            return a.patchValue - b.patchValue;
        } else if (currentSortOrder === 'DESC') {
            return b.patchValue - a.patchValue;
        } else if (currentSortOrder === 'ORIGIN_ASC') {
            return (a.originPlace || '').localeCompare(b.originPlace || '', 'ko');
        } else if (currentSortOrder === 'ORIGIN_DESC') {
            return (b.originPlace || '').localeCompare(a.originPlace || '', 'ko');
        }
        return 0;
    });

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
        
        // referrerpolicy 출처 정보 봉쇄 차단막 선언 고정 (100% 엑박 원천 차단 우회책)
        const originalIconUrl = item.icon ? item.icon.trim() : '';
        const iconTag = originalIconUrl ? `<img src="${originalIconUrl}" referrerpolicy="no-referrer" alt="아이콘" style="width: 32px; height: 32px; object-fit: contain; vertical-align: middle; border-radius: 4px;">` : '';

        let tableTradeText = item.rewardType || '-';
        if (isTradeable(item.rewardType)) tableTradeText = '거래 가능';
        else if (isNotTradeable(item.rewardType)) tableTradeText = '거래 불가';

        // 🌟 [두 번째 괄호 정밀 타겟 브레이킹 엔터 알고리즘]
        let displayName = item.name;
        if (item.name && item.name.includes('(')) {
            const bracketCount = (item.name.match(/\(/g) || []).length;
            if (bracketCount >= 2) {
                const firstIdx = item.name.indexOf('(');
                const secondIdx = item.name.indexOf('(', firstIdx + 1);
                const mainTitle = item.name.substring(0, secondIdx).trim();
                const subTitle = item.name.substring(secondIdx).trim();
                displayName = `${mainTitle}<br><span style="display: block; font-size: 0.85em; color: var(--text-muted); font-weight: normal; margin-top: 2px;">${subTitle}</span>`;
            } else {
                const parts = item.name.split('(');
                const mainTitle = parts[0].trim();
                const subTitle = parts.slice(1).join('(').trim();
                displayName = `${mainTitle}<br><span style="display: block; font-size: 0.85em; color: var(--text-muted); font-weight: normal; margin-top: 2px;">(${subTitle}</span>`;
            }
        }

        tr.innerHTML = `
            <td class="col-no">${idx + 1}</td> 
            <td class="col-check"><input type="checkbox" ${isChecked} onchange="toggleItem('${item.id}', this)"></td>
            <td class="col-icon" style="text-align: center; padding: 4px;">${iconTag}</td>
            <td class="col-name">${displayName}</td>
            <td class="col-cond">${item.patch}</td>
            <td class="col-type" style="color: #ff9f1c; font-weight: bold;">${item.originPlace || '-'}</td>
            <td class="col-score">${item.condition || '-'}</td>
            <td class="col-rw-type" style="color: ${textColor}; font-weight: bold;">${tableTradeText}</td>
        `;
        listBody.appendChild(tr);
    });
    calculateChapterProgress(filtered);
}

// 보유 상태 변경 감지 세이브 핸들러
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
    const checkedCount = currentItems.filter(item => checkedItems[id]).length;
    const percent = Math.round((checkedCount / total) * 100);

    document.getElementById('chapter-percent').textContent = `${percent}%`;
    document.getElementById('chapter-count').textContent = `${checkedCount}/${total}`;
    document.getElementById('chapter-bar').style.width = `${percent}%`;
}

// 비동기 엔진 최초 구동 트리거 점화 실행
fetchData();
