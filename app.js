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

// 1. 원격 구글 시트 데이터 비동기 인프라 로드 및 매핑
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

// 2. 검색 인터페이스 인풋 핸들러
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
// app.js - Part 2 (정렬 명령 스위치 핸들러 및 양방향 크로스 리셋 시스템)
// =========================================================================

// 사용자가 지정한 정렬 타입에 맞춰 클래스 활성화 불빛을 제어하고 연산을 수행합니다.
function selectSortOrder(order) {
    currentSortOrder = order;
    document.querySelectorAll('.sort-filter-btn').forEach(btn => btn.classList.remove('active'));
    
    if (order === 'ASC') document.getElementById('sort-asc').classList.add('active');
    if (order === 'DESC') document.getElementById('sort-desc').classList.add('active');
    if (order === 'ORIGIN_ASC') document.getElementById('sort-origin-asc').classList.add('active');
    if (order === 'ORIGIN_DESC') document.getElementById('sort-origin-desc').classList.add('active');
    
    // 획득처 이름순 정렬 클릭 시 획득처 드롭다운을 자동으로 '전체 보기'로 풀어 정렬 범위 유지
    if (order === 'ORIGIN_ASC' || order === 'ORIGIN_DESC') {
        currentOriginFilter = 'ALL';
        resetOriginDropdownUI();
        
        if (currentRewardFilter === 'ALL' && !currentSearchQuery) {
            const activeMainBtn = document.querySelector('#main-category-group button.active');
            if (activeMainBtn) {
                currentMain = activeMainBtn.textContent;
            } else {
                const firstMainBtn = document.querySelector('#main-category-group button');
                if (firstMainBtn) firstMainBtn.click();
            }
        }
        updatePathDisplay();
    }
    
    renderList();
}

// 카테고리 선택(A열 분류) 동적 HTML 노드 버튼 빌더
function initMenu() {
    const mains = [...new Set(rawData.map(item => item.main))].filter(Boolean);
    const mainGroup = document.getElementById('main-category-group');
    mainGroup.innerHTML = '';

    mains.forEach((main, idx) => {
        if(!main) return;
        const btn = document.createElement('button');
        btn.textContent = main;
        btn.onclick = () => selectMainCategory(main, btn);
        mainGroup.appendChild(btn);
        
        // 🌟 [순서 버그 격파 1단계] 첫 번째 대분류 단추를 변수 상에 강제 사전 세팅 고정합니다.
        if (idx === 0) {
            currentMain = main;
            btn.classList.add('active');
        }
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

    updatePathDisplay();
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

    updatePathDisplay();
    renderList(); 
}

function handleOriginDropdownChange(selectElement) {
    currentOriginFilter = selectElement.value;
    updatePathDisplay();
    renderList();
}

function clearOriginDropdownFilter() {
    if (currentOriginFilter === 'ALL') return;
    
    currentOriginFilter = 'ALL';
    resetOriginDropdownUI(); 
    
    updatePathDisplay();
    renderList();
}

function clearSearchInputFilter() {
    if (!currentSearchQuery) return; 
    
    currentSearchQuery = '';
    const searchInput = document.getElementById('search-keyword');
    if (searchInput) searchInput.value = ''; 
    
    if (currentRewardFilter === 'ALL' && currentOriginFilter === 'ALL') {
        const activeMainBtn = document.querySelector('#main-category-group button.active');
        if (activeMainBtn) currentMain = activeMainBtn.textContent;
    }
    
    updatePathDisplay();
    renderList();
}

// 공통 베이스 필터 초기화
function clearCommonBaseFilters() {
    if (currentRewardFilter !== 'ALL' || currentOriginFilter !== 'ALL') {
        currentMain = ''; 
        document.querySelectorAll('#main-category-group button').forEach(b => b.classList.remove('active'));
    }
}

// 기본 카테고리 복원
function restoreDefaultCategory() {
    if (currentRewardFilter === 'ALL' && currentOriginFilter === 'ALL') {
        const activeMainBtn = document.querySelector('#main-category-group button.active');
        if (activeMainBtn) {
            currentMain = activeMainBtn.textContent;
        } else {
            const firstMainBtn = document.querySelector('#main-category-group button');
            if (firstMainBtn) firstMainBtn.click();
        }
        updatePathDisplay();
    }
}

// 경로 디스플레이 업데이트
function updatePathDisplay() {
    const display = document.getElementById('current-path-display');
    if (!display) return;

    let basePathText = `📂 분류 : ${currentMain || '전체 목록'}`;
    let texts = [];
    
    if (currentRewardFilter !== 'ALL') texts.push(`⚖️ 거래 여부 : ${currentRewardFilter}`);
    if (currentOriginFilter !== 'ALL') texts.push(`🗺️ 획득처 : ${currentOriginFilter}`);
    
    if (texts.length > 0) {
        display.textContent = `${basePathText} ➡️ ⛓️ [복합 필터 가동중] ${texts.join(' ➕ ')}`;
    } else {
        display.textContent = basePathText;
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
// app.js - Part 3 (교집합 연산 정렬 스코프 및 8열 무결성 렌더링)
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

// 다중 복합 필터 조건식에 부합하는 현재 타겟 아이템 배열 정제 마스터 함수
function getCurrentFilteredItems() {
    return rawData.filter(item => {
        if (currentSearchQuery) {
            return item.name.toLowerCase().includes(currentSearchQuery) || 
                   item.patch.toLowerCase().includes(currentSearchQuery) || 
                   item.originPlace.toLowerCase().includes(currentSearchQuery) || 
                   item.condition.toLowerCase().includes(currentSearchQuery) || 
                   item.rewardType.toLowerCase().includes(currentSearchQuery);
        }
        
        if (currentMain && item.main !== currentMain) return false;
        
        if (currentRewardFilter !== 'ALL') {
            if (currentRewardFilter === '거래 가능' && !isTradeable(item.rewardType)) return false;
            if (currentRewardFilter === '거래 불가' && !isNotTradeable(item.rewardType)) return false;
        }
        
        if (currentOriginFilter !== 'ALL' && item.originPlace !== currentOriginFilter) return false;
        
        return true;
    });
}

// 리스트 실시간 동적 렌더링 엔진
function renderList() {
    const listBody = document.getElementById('achievement-list');
    listBody.innerHTML = '';

    let filtered = getCurrentFilteredItems();

    if (currentStatusFilter === 'UNCOMPLETED') {
        filtered = filtered.filter(item => !checkedItems[item.id]); 
    } else if (currentStatusFilter === 'COMPLETED') {
        filtered = filtered.filter(item => checkedItems[item.id]);  
    }

    filtered.sort((a, b) => {
        if (currentSortOrder === 'ASC') return a.patchValue - b.patchValue;
        if (currentSortOrder === 'DESC') return b.patchValue - a.patchValue;
        if (currentSortOrder === 'ORIGIN_ASC') return (a.originPlace || '').localeCompare(b.originPlace || '', 'ko');
        if (currentSortOrder === 'ORIGIN_DESC') return (b.originPlace || '').localeCompare(b.originPlace || '', 'ko');
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
        const originalIconUrl = item.icon ? item.icon.trim() : '';
        const iconTag = originalIconUrl ? `<img src="${originalIconUrl}" referrerpolicy="no-referrer" alt="아이콘" style="width: 32px; height: 32px; object-fit: contain; vertical-align: middle; border-radius: 4px;">` : '';

        // ✨ 이 부분에서 표에 인쇄될 글자를 O 또는 X로 매핑합니다.
        let tableTradeText = item.rewardType || '-';
        if (isTradeable(item.rewardType)) tableTradeText = 'O';
        else if (isNotTradeable(item.rewardType)) tableTradeText = 'X';

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
                const mainTitle = parts ? parts.trim() : ''; 
                const subTitle = parts.slice(1).join('(').trim();
                displayName = `${mainTitle}<br><span style="display: block; font-size: 0.85em; color: var(--text-muted); font-weight: normal; margin-top: 2px;">(${subTitle}</span>`;
            }
        }

        let displayCondition = item.condition || '-';
        if (item.condition && item.condition.includes('[')) {
            const parts = item.condition.split('[');
            const beforeBracket = parts ? parts.trim() : '';
            const afterBracket = parts.slice(1).join('[').trim();
            displayCondition = `${beforeBracket}<br><span style="display: block; font-size: 0.85em; color: var(--text-muted); font-weight: normal; margin-top: 2px;">[${afterBracket}</span>`;
        }

        tr.innerHTML = `
            <td class="col-no">${idx + 1}</td> 
            <td class="col-check"><input type="checkbox" ${isChecked} onchange="toggleItem('${item.id}', this)"></td>
            <td class="col-icon" style="text-align: center; padding: 4px;">${iconTag}</td>
            <td class="col-name">${displayName}</td>
            <td class="col-cond">${item.patch}</td>
            <td class="col-type" style="color: #ff9f1c; font-weight: bold;">${item.originPlace || '-'}</td>
            <td class="col-score" style="text-align: left; padding-left: 12px;">${displayCondition}</td>
            <td class="col-rw-type" style="color: ${textColor}; font-weight: bold;">${tableTradeText}</td>
        `;
        listBody.appendChild(tr);
    });
    
    calculateChapterProgress(getCurrentFilteredItems());
}
// =========================================================================
// app.js - Part 4 (체크 상태 제어 및 진척도 실시간 연산 인터페이스)
// =========================================================================

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
        calculateChapterProgress(getCurrentFilteredItems());
    }
}

function calculateTotalProgress() {
    const total = rawData.length;
    if(total === 0) return;
    
    const checkedCount = rawData.filter(item => checkedItems[item.id]).length;
    const percent = Math.round((checkedCount / total) * 100);

    document.getElementById('total-percent').textContent = `${percent}%`;
    document.getElementById('total-count').textContent = `(${checkedCount}/${total})`;
    document.getElementById('total-bar').style.width = `${percent}%`;
}

function calculateChapterProgress(currentItems) {
    const total = currentItems.length;
    const titleLabel = document.getElementById('chapter-title-label');
    
    if (titleLabel) {
        if (currentSearchQuery) {
            titleLabel.textContent = "검색 아이템 보유율";
        } else if (currentRewardFilter !== 'ALL' || currentOriginFilter !== 'ALL') {
            titleLabel.textContent = "선택 필터 아이템 보유율";
        } else {
            titleLabel.textContent = "현재 분류 아이템 보유율";
        }
    }

    // 🌟 [순서 버그 격파 2단계 완결]
    let exactTotal = total;
    if (exactTotal === 0 && currentMain && !currentSearchQuery && currentRewardFilter === 'ALL' && currentOriginFilter === 'ALL') {
        exactTotal = rawData.filter(item => item.main === currentMain).length;
    }

    if(exactTotal === 0) {
        document.getElementById('chapter-percent').textContent = `0%`;
        document.getElementById('chapter-count').textContent = `(0/0)`;
        document.getElementById('chapter-bar').style.width = `0%`;
        return;
    }
    
    const checkedCount = currentItems.filter(item => checkedItems[item.id]).length;
    const percent = Math.round((checkedCount / exactTotal) * 100);

    document.getElementById('chapter-percent').textContent = `${percent}%`;
    document.getElementById('chapter-count').textContent = `(${checkedCount}/${exactTotal})`;
    document.getElementById('chapter-bar').style.width = `${percent}%`;
}

// 🌟 [순서 버그 격파 3단계] 원본 인프라 안정 구동부 기동
fetchData().then(() => {
    updatePathDisplay();
    renderList();
});
