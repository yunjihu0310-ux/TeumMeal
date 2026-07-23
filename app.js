function readJson(key,fallback){try{const value=JSON.parse(localStorage.getItem(key));return value??fallback}catch(error){localStorage.removeItem(key);return fallback}}
function readNumber(key,fallback){const raw=localStorage.getItem(key);if(raw===null)return fallback;const value=Number(raw);return Number.isFinite(value)?value:fallback}

const emptyOnboardingVersion='2026-07-23-empty-v1';
if(localStorage.getItem('teummeal-onboarding-version')!==emptyOnboardingVersion){
  const legacyProfile=readJson('teummeal-profile',null);
  const isSeededProfile=legacyProfile?.name==='민준'&&!legacyProfile.school&&!legacyProfile.home&&!legacyProfile.academy;
  if(localStorage.getItem('teummeal-budget')==='8000')localStorage.removeItem('teummeal-budget');
  if(localStorage.getItem('teummeal-time')==='20')localStorage.removeItem('teummeal-time');
  if(isSeededProfile)localStorage.removeItem('teummeal-profile');
  localStorage.removeItem('teummeal-decisions');
  localStorage.setItem('teummeal-onboarding-version',emptyOnboardingVersion);
}
const storedVoterId=localStorage.getItem('teummeal-voter-id')||(crypto.randomUUID?.()||`voter-${Date.now()}-${Math.random().toString(16).slice(2)}`);localStorage.setItem('teummeal-voter-id',storedVoterId);

const state = {
  ingredients: readJson('teummeal-ingredients',[]),
  vote: readJson('teummeal-vote',null),
  budget: readNumber('teummeal-budget',null),
  mealTime: readNumber('teummeal-time',null),
  profile: readJson('teummeal-profile',{name:'',school:'',home:'',academy:''}),
  nearbyPlaces: [],
  nearbyAddress: '',
  locationLoading: false,
  useCurrentLocation: localStorage.getItem('teummeal-use-location')==='true',
  currentPosition: null,
  locationWatchId: null,
  settingsSaveTimer: null,
  map: null,
  mapMarkers: null,
  mapPoint: null,
  placeMarkers: [],
  visiblePlaces: [],
  nearbyFilters: {maxWalk:15,studentBudget:false,nearest:false},
  voterId: storedVoterId,
  voteApiOnline: false,
  votePollTimer: null,
  decisionHistory: readJson('teummeal-decision-history',[]),
  rejectedMenus: readJson('teummeal-rejected-menus',[]),
  lastRecommendation: {custom:null,places:[]},
};

const pages = [...document.querySelectorAll('.page')];
const navButtons = [...document.querySelectorAll('.bottom-nav button')];
const pageMap = {home:'homePage',fridge:'fridgePage',vote:'votePage',nearby:'nearbyPage',result:'resultPage',settings:'settingsPage'};
const menus = [
  {emoji:'🍙', name:'참치마요 컵밥', price:6500, minutes:10, match:'97%'},
  {emoji:'🍜', name:'학교 앞 떡볶이', price:7000, minutes:20, match:'95%'},
  {emoji:'🍛', name:'소소한 카레', price:8500, minutes:20, match:'92%'},
  {emoji:'🥪', name:'바질 치킨 샌드위치', price:7900, minutes:10, match:'90%'},
  {emoji:'🍝', name:'토마토 파스타', price:11000, minutes:30, match:'86%'},
  {emoji:'🍔', name:'치즈버거 세트', price:7900, minutes:20, match:'93%'},
  {emoji:'🍱', name:'제육 도시락', price:7500, minutes:20, match:'94%'},
  {emoji:'🍲', name:'김치찌개 백반', price:9000, minutes:30, match:'91%'},
  {emoji:'🍣', name:'초밥 10피스', price:12000, minutes:30, match:'87%'},
  {emoji:'🥟', name:'고기만두와 쫄면', price:8000, minutes:20, match:'92%'},
  {emoji:'🍗', name:'순살치킨 컵', price:6000, minutes:10, match:'90%'},
  {emoji:'🌯', name:'치킨 또띠아', price:5500, minutes:10, match:'89%'},
  {emoji:'🍚', name:'불고기 삼각김밥 세트', price:4500, minutes:10, match:'96%'},
  {emoji:'🍜', name:'잔치국수', price:7000, minutes:20, match:'91%'},
  {emoji:'🥘', name:'김치 치즈 볶음밥', price:7500, minutes:20, match:'94%'},
  {emoji:'🥗', name:'닭가슴살 샐러드', price:8500, minutes:10, match:'85%'},
  {emoji:'🍕', name:'피자 한 조각 세트', price:6900, minutes:10, match:'88%'},
  {emoji:'🍢', name:'어묵과 김밥', price:5000, minutes:10, match:'95%'},
  {emoji:'🥩', name:'돼지불백', price:10000, minutes:30, match:'90%'}
];

function go(page){
  pages.forEach(p=>p.classList.toggle('active',p.id===pageMap[page]));
  navButtons.forEach(b=>b.classList.toggle('active',b.dataset.go===page));
  document.querySelector('.topbar').style.display = page === 'home' ? 'flex' : 'none';
  if(page==='settings') renderSettings();
  if(page==='vote') renderVotePage();
  if(page==='nearby'){initMap();setTimeout(()=>state.map?.invalidateSize(),80);refreshLocationRecommendations();}
  window.scrollTo({top:0,behavior:'smooth'});
}

function showToast(message){
  const toast=document.getElementById('toast'); toast.textContent=message; toast.classList.add('show');
  clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>toast.classList.remove('show'),2200);
}

function openModal(html){document.getElementById('modalContent').innerHTML=html;document.getElementById('modalBackdrop').classList.add('open')}
function closeModal(){document.getElementById('modalBackdrop').classList.remove('open')}

function renderIngredients(){
  const list=document.getElementById('ingredientList');
  list.innerHTML=state.ingredients.map((item,i)=>`<div class="ingredient-item"><span>${['🥬','🥚','🥩','🧅','🧀'][i%5]}</span><strong>${item}</strong><small>보유 중</small><button data-remove="${i}">×</button></div>`).join('');
  document.getElementById('fridgeEmpty').style.display=state.ingredients.length?'none':'block';
  const cta=document.querySelector('[data-action="cook"]');
  cta.disabled=!state.ingredients.length; cta.classList.toggle('ready',!!state.ingredients.length);
  document.getElementById('ingredientCount').textContent=`재료 ${state.ingredients.length}개`;
  localStorage.setItem('teummeal-ingredients',JSON.stringify(state.ingredients));
}

function addIngredient(value){
  const clean=value.trim(); if(!clean)return;
  if(state.ingredients.includes(clean)){showToast('이미 추가한 재료예요');return}
  state.ingredients.push(clean); renderIngredients(); showToast(`${clean}, 냉장고에 추가했어요`);
}

function renderRecommendations(custom, locationPlaces=[]){
  state.lastRecommendation={custom,places:locationPlaces};
  const recentNames=new Set(state.decisionHistory.slice(0,8).map(item=>item.menu));const rejected=new Set(state.rejectedMenus.map(item=>item.menu));
  const score=menu=>(menu.price<=state.budget?35:-Math.min(30,(menu.price-state.budget)/250))+(menu.minutes<=state.mealTime?30:-20)+(Number(menu.match.replace('%',''))/5)-(recentNames.has(menu.name)?45:0)-(rejected.has(menu.name)?80:0);
  const eligible=menus.filter(m=>m.price<=state.budget&&m.minutes<=state.mealTime&&!rejected.has(m.name));
  const pool=[...(eligible.length>=3?eligible:menus)].sort((a,b)=>score(b)-score(a));
  const locationPool=locationPlaces.filter(place=>!rejected.has(place.name));
  const realPlaces=locationPool.slice(0,4).map((place,index)=>({emoji:cuisineEmoji(place.cuisine),name:place.name,price:null,minutes:place.walkMinutes,match:`${98-index*2}%`,real:true,cuisine:place.cuisine}));
  const selected=[...realPlaces,...pool].slice(0,8);
  if(custom?.length){selected[0]={emoji:'🍳',name:`${custom[0]} 볶음밥`,price:2500,minutes:10,match:'98%',custom:true}}
  const budgetText=state.budget.toLocaleString('ko-KR');
  document.getElementById('resultBudget').textContent=`💰 ${budgetText}원 이하`;
  document.getElementById('resultTime').textContent=`⏱ ${state.mealTime}분 안에`;
  const route=getActiveRoute();
  document.getElementById('resultRoute').textContent=`🎒 ${route.fromLabel} → ${route.toLabel}`;
  document.getElementById('resultCredit').classList.toggle('visible',realPlaces.length>0);
  document.getElementById('recommendStack').innerHTML=selected.map((m,i)=>{
    const reason=m.custom?`${custom.slice(0,3).join(', ')}을 활용해 10분이면 만들 수 있어요.`:m.real?`${route.toLabel} 주소에서 도보 약 ${m.minutes}분 거리의 실제 ${cuisineLabel(m.cuisine)} 음식점이에요.`:`${budgetText}원 예산과 ${state.mealTime}분 안에 맞고, 지금 중3 학생들이 많이 골랐어요.`;
    const meta=m.real?`${m.minutes}분 · 가격 정보 확인 필요`:`${m.minutes}분 · ${m.price.toLocaleString('ko-KR')}원`;
    return `<article class="recommend-card ${i===0?'top':''}" data-result-kind="${m.real?'place':'menu'}">${i===0?'<span class="rank-badge">STUDENT BEST</span>':''}<div class="food-visual">${m.emoji}</div><small>${m.match} 상황 일치 · ${m.real?'실제 음식점':'추천 메뉴'}</small><h3>${escapeHtml(m.name)}</h3><p>${reason}<br>${meta}</p><div class="recommend-actions"><button class="reject-button" data-action="reject" data-menu="${escapeHtml(m.name)}">별로예요</button><button data-action="decide" data-menu="${escapeHtml(m.name)}">이걸로 결정</button></div></article>`
  }).join('');
  setResultFilter('all');
  go('result');
}

function hasMealPreferences(){
  return Number.isFinite(state.budget)&&state.budget>0&&Number.isFinite(state.mealTime)&&state.mealTime>0;
}

function startOfThisWeek(){
  const now=new Date();const day=(now.getDay()+6)%7;
  return new Date(now.getFullYear(),now.getMonth(),now.getDate()-day).getTime();
}

function weeklyDecisionCount(){
  const weekStart=startOfThisWeek();
  return state.decisionHistory.filter(item=>Number(item.at)>=weekStart).length;
}

function renderWeeklyCount(){
  document.getElementById('weeklyCount').textContent=`${weeklyDecisionCount()}번`;
  const weekStart=startOfThisWeek();const daily=Array(7).fill(0);
  state.decisionHistory.forEach(item=>{const offset=Math.floor((Number(item.at)-weekStart)/86400000);if(offset>=0&&offset<7)daily[offset]++});
  const peak=Math.max(1,...daily);
  document.querySelectorAll('.mini-chart i').forEach((bar,index)=>{bar.style.height=daily[index]?`${Math.max(22,Math.round(daily[index]/peak*100))}%`:'4%'});
}

function getActiveRoute(){
  const hour=new Date().getHours();
  const p=state.profile;
  if(state.useCurrentLocation&&state.currentPosition)return {from:'current',to:'current',fromLabel:'현재 위치',toLabel:'내 주변',address:'',point:state.currentPosition};
  if(hour>=6&&hour<11&&p.home&&p.school)return {from:'home',to:'school',fromLabel:'집',toLabel:'학교',address:p.school};
  if(hour>=14&&hour<21&&p.school&&p.academy)return {from:'school',to:'academy',fromLabel:'학교',toLabel:'학원',address:p.academy};
  if(p.school&&p.home)return {from:'school',to:'home',fromLabel:'학교',toLabel:'집',address:p.home};
  if(p.academy)return {from:'school',to:'academy',fromLabel:'학교',toLabel:'학원',address:p.academy};
  if(p.school)return {from:'home',to:'school',fromLabel:'집',toLabel:'학교',address:p.school};
  if(p.home)return {from:'school',to:'home',fromLabel:'학교',toLabel:'집',address:p.home};
  return {from:'school',to:'academy',fromLabel:'학교',toLabel:'학원',address:''};
}

function escapeHtml(value){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
function cuisineLabel(value=''){const c=value.toLowerCase();if(c.includes('korean'))return '한식';if(c.includes('japanese'))return '일식';if(c.includes('chinese'))return '중식';if(c.includes('pizza')||c.includes('italian'))return '양식';if(c.includes('burger'))return '버거';if(c.includes('coffee'))return '카페';return '주변';}
function cuisineEmoji(value=''){const label=cuisineLabel(value);return {'한식':'🍚','일식':'🍣','중식':'🥟','양식':'🍝','버거':'🍔','카페':'🥪'}[label]||'🍽️';}
function distanceMeters(a,b){const rad=n=>n*Math.PI/180;const dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon);const x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}

async function geocodeAddress(address){
  const cached=state.profile.geo;
  if(cached?.address===address)return cached;
  const url=`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=kr&accept-language=ko&q=${encodeURIComponent(address)}`;
  const response=await fetchWithTimeout(url,{headers:{Accept:'application/json'}},8000);
  if(!response.ok)throw new Error('주소를 찾지 못했어요');
  const data=await response.json();if(!data.length)throw new Error('주소를 찾지 못했어요');
  state.profile.geo={address,lat:Number(data[0].lat),lon:Number(data[0].lon)};localStorage.setItem('teummeal-profile',JSON.stringify(state.profile));return state.profile.geo;
}

async function fetchNearbyPlaces(point){
  const query=`[out:json][timeout:12];(node["amenity"~"restaurant|fast_food|cafe|food_court"](around:1500,${point.lat},${point.lon});way["amenity"~"restaurant|fast_food|cafe|food_court"](around:1500,${point.lat},${point.lon}););out center tags 60;`;
  const endpoints=['https://overpass.kumi.systems/api/interpreter','https://overpass-api.de/api/interpreter'];
  let response;
  for(const endpoint of endpoints){
    try{response=await fetchWithTimeout(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:`data=${encodeURIComponent(query)}`},7000);if(response.ok)break}catch(error){response=null}
  }
  if(!response?.ok)throw new Error('주변 음식점 조회가 지연되고 있어요');
  const data=await response.json();
  return data.elements.map(item=>{const lat=item.lat||item.center?.lat,lon=item.lon||item.center?.lon;const meters=distanceMeters(point,{lat,lon});return {name:item.tags?.['name:ko']||item.tags?.name,cuisine:item.tags?.cuisine||item.tags?.amenity||'',lat,lon,walkMinutes:Math.max(1,Math.round(meters/70)),meters};}).filter(item=>item.name&&Number.isFinite(item.lat)&&Number.isFinite(item.lon)&&Number.isFinite(item.meters)).sort((a,b)=>a.meters-b.meters).slice(0,12);
}

async function fetchWithTimeout(url,options={},timeout=8000){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
  try{return await fetch(url,{...options,signal:controller.signal})}finally{clearTimeout(timer)}
}

function renderNearbyPlaces(places,route){
  const list=document.getElementById('restaurantList');
  state.visiblePlaces=places.slice(0,10);
  if(!state.visiblePlaces.length){list.innerHTML='<div class="restaurant-loading">선택한 조건에 맞는 음식점이 없어요.<br>도보 시간을 늘리거나 필터를 꺼보세요.</div>';return}
  list.innerHTML=state.visiblePlaces.map((place,index)=>`<article class="restaurant-card" data-map-index="${index}"><div class="restaurant-photo ${index%2?'noodle':'curry'}"><span>${cuisineEmoji(place.cuisine)}</span><b>도보 약 ${place.walkMinutes}분</b></div><div class="restaurant-info"><small>${index?'조건 맞춤 추천':`${route.point?'현재 위치':'주소'} 기반 AI PICK`}</small><h3>${escapeHtml(place.name)}</h3><p>${cuisineLabel(place.cuisine)} · ${route.toLabel} 주변 · 가격 확인 필요</p><div><span>${Math.round(place.meters)}m 거리</span><i>지도 연동</i></div><button data-action="decide" data-menu="${escapeHtml(place.name)}">이걸로 결정</button></div></article>`).join('');
}

function renderNearbyError(message){
  state.visiblePlaces=[];document.getElementById('restaurantList').innerHTML=`<div class="restaurant-loading"><strong>${escapeHtml(message)}</strong><br><button class="outline-button" data-action="retryPlaces">다시 시도</button></div>`;
}

function studentBudgetScore(place){
  const value=`${place.cuisine} ${place.name}`.toLowerCase();
  if(/fast_food|food_court|김밥|분식|떡볶이|버거|burger|noodle|국수|sandwich|치킨|chicken/.test(value))return 3;
  if(/cafe|korean|한식|rice|라면|ramen/.test(value))return 2;
  return 1;
}

function recommendationScore(place){
  const nameScore=[...place.name].reduce((sum,char)=>sum+char.charCodeAt(0),0)%40;
  return studentBudgetScore(place)*25+nameScore-place.walkMinutes*1.5;
}

function applyNearbyFilters(announce=false){
  const route=getActiveRoute(),filters=state.nearbyFilters;
  let places=state.nearbyPlaces.filter(place=>place.walkMinutes<=filters.maxWalk);
  if(filters.studentBudget)places=places.filter(place=>studentBudgetScore(place)>=2);
  if(filters.nearest)places.sort((a,b)=>a.meters-b.meters);
  else places.sort((a,b)=>recommendationScore(b)-recommendationScore(a));
  document.getElementById('walkFilter').textContent=`도보 ${filters.maxWalk}분`;
  document.querySelectorAll('[data-nearby-filter]').forEach(button=>{
    const key=button.dataset.nearbyFilter;const active=key==='walk'||(key==='budget'&&filters.studentBudget)||(key==='nearest'&&filters.nearest);
    button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
  });
  renderNearbyPlaces(places,route);updateMap(state.mapPoint,places,route);
  if(announce)showToast(`${filters.maxWalk}분 안의 음식점 ${places.length}곳을 바로 반영했어요`);
}

function changeNearbyFilter(key){
  if(key==='walk'){const values=[5,10,15,20];const current=values.indexOf(state.nearbyFilters.maxWalk);state.nearbyFilters.maxWalk=values[(current+1)%values.length]}
  if(key==='budget')state.nearbyFilters.studentBudget=!state.nearbyFilters.studentBudget;
  if(key==='nearest')state.nearbyFilters.nearest=!state.nearbyFilters.nearest;
  applyNearbyFilters(true);
}

function initMap(){
  const placeholder=document.getElementById('mapPlaceholder');
  if(state.map)return true;
  if(!window.L){placeholder.className='map-placeholder error';placeholder.innerHTML='<span>!</span><strong>지도를 불러오지 못했어요</strong><small>인터넷 연결을 확인한 뒤 새로고침해 주세요.</small>';return false}
  state.map=L.map('teumMap',{zoomControl:true,scrollWheelZoom:false,attributionControl:true}).setView([37.5665,126.978],13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(state.map);
  state.mapMarkers=L.layerGroup().addTo(state.map);placeholder.classList.add('hidden');return true;
}

function updateMap(point,places,route){
  if(!initMap()||!point)return;
  state.mapPoint=point;state.mapMarkers.clearLayers();state.placeMarkers=[];
  const center=[point.lat,point.lon];
  const centerIcon=L.divIcon({className:'',html:route.point?'<div class="teum-current-marker"></div>':'<div class="teum-destination-marker">⌖</div>',iconSize:[22,22],iconAnchor:[11,11]});
  L.marker(center,{icon:centerIcon,zIndexOffset:1000}).addTo(state.mapMarkers).bindPopup(`<strong>${escapeHtml(route.point?'현재 위치':route.toLabel)}</strong>`);
  const bounds=L.latLngBounds([center]);
  places.slice(0,10).forEach((place,index)=>{
    const icon=L.divIcon({className:'',html:`<div class="teum-map-marker"><span>${index+1}</span></div>`,iconSize:[34,34],iconAnchor:[10,30]});
    const marker=L.marker([place.lat,place.lon],{icon}).addTo(state.mapMarkers).bindPopup(`<strong>${escapeHtml(place.name)}</strong><br><small>${cuisineLabel(place.cuisine)} · 도보 약 ${place.walkMinutes}분</small>`);
    marker.on('click',()=>highlightRestaurant(index));state.placeMarkers.push(marker);bounds.extend([place.lat,place.lon]);
  });
  state.map.invalidateSize();
  if(places.length)state.map.fitBounds(bounds,{padding:[28,28],maxZoom:16});else state.map.setView(center,15);
}

function highlightRestaurant(index){
  document.querySelectorAll('[data-map-index]').forEach(card=>card.classList.toggle('map-active',Number(card.dataset.mapIndex)===index));
  document.querySelector(`[data-map-index="${index}"]`)?.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function focusMapPlace(index){
  const place=state.visiblePlaces[index],marker=state.placeMarkers[index];if(!place||!state.map)return;
  state.map.setView([place.lat,place.lon],17,{animate:true});marker?.openPopup();highlightRestaurant(index);
}

async function loadLocationPlaces(showPage=false){
  const route=getActiveRoute();
  const status=document.getElementById('routeStatus');
  if(!route.address&&!route.point){status.className='route-status';status.innerHTML='<i></i>현재 위치를 켜거나 자주 가는 주소를 입력해 주세요';if(showPage)renderNearbyPlaces([],route);return []}
  const lookupKey=route.point?`current:${route.point.lat.toFixed(3)},${route.point.lon.toFixed(3)}`:route.address;
  if(state.nearbyAddress===lookupKey&&state.nearbyPlaces.length){status.className='route-status ready';status.innerHTML=`<i></i>${route.toLabel} ${state.nearbyPlaces.length}곳을 반영했어요`;if(showPage)applyNearbyFilters(false);return state.nearbyPlaces}
  if(state.locationLoading)return state.nearbyPlaces;
  state.locationLoading=true;status.className='route-status loading';status.innerHTML=`<i></i>${route.toLabel} 음식점을 찾는 중이에요`;
  try{const point=route.point||await geocodeAddress(route.address);const places=await fetchNearbyPlaces(point);state.nearbyPlaces=places;state.nearbyAddress=lookupKey;state.mapPoint=point;status.className='route-status ready';status.innerHTML=`<i></i>${route.toLabel} ${places.length}곳을 반영했어요`;if(showPage)applyNearbyFilters(false);return places}
  catch(error){status.className='route-status';status.innerHTML=`<i></i>${error.message} · 기본 추천을 보여드려요`;if(showPage)renderNearbyError(error.message);return []}
  finally{state.locationLoading=false}
}

async function recommendByContext(custom){
  if(!hasMealPreferences()){
    go('home');
    showToast(!state.budget&&!state.mealTime?'예산과 먹을 시간을 먼저 선택해 주세요':!state.budget?'오늘 예산을 먼저 선택해 주세요':'먹을 시간을 먼저 선택해 주세요');
    return;
  }
  const button=document.querySelector('[data-action="recommend"]');if(button){button.disabled=true;button.querySelector('span').textContent='경로 주변 찾는 중...'}
  const places=custom?.length?[]:await loadLocationPlaces(false);renderRecommendations(custom,places);
  if(button){button.disabled=false;button.querySelector('span').textContent='AI 추천 받기'}
}

async function refreshLocationRecommendations(){
  const route=getActiveRoute();
  document.getElementById('nearbyTitle').textContent=`${route.toLabel} 주변 맛집`;
  document.getElementById('routeDetail').textContent=route.point?'현재 위치를 따라 가까운 음식점이 바뀌어요':route.address?`${route.fromLabel} → ${route.toLabel} · ${route.address}`:'현재 위치를 켜거나 주소를 설정해 주세요';
  document.getElementById('restaurantList').innerHTML='<div class="restaurant-loading">주소 기반 음식점을 찾고 있어요…</div>';
  await loadLocationPlaces(true);
}

function syncStudentMode(){
  document.getElementById('budgetInput').value=state.budget??'';
  document.querySelectorAll('[data-time]').forEach(button=>button.classList.toggle('active',Number(button.dataset.time)===state.mealTime));
  const route=getActiveRoute();
  document.getElementById('routePill').textContent=route.address||route.point?`${route.fromLabel} → ${route.toLabel}`:'경로 미설정';
  const preferences=[state.budget?`${state.budget.toLocaleString('ko-KR')}원`:null,state.mealTime?`${state.mealTime}분`:null].filter(Boolean);
  document.getElementById('contextLine').textContent=preferences.length===2?`${preferences.join(' · ')} · ${route.address||route.point?`${route.toLabel} 주변`:'위치 미설정'}`:'예산과 먹을 시간을 선택해 주세요';
  const hour=new Date().getHours();document.getElementById('studentTrend').textContent=hour<11?'지금 등교 전 학생들은 컵밥':hour<17?'지금 중3은 분식':hour<21?'지금 학원가 학생들은 김밥':'지금 학생들은 간편식';
  document.querySelectorAll('[data-budget]').forEach(button=>button.classList.toggle('active',Number(button.dataset.budget)===state.budget));
  if(state.budget)localStorage.setItem('teummeal-budget',state.budget);else localStorage.removeItem('teummeal-budget');
  if(state.mealTime)localStorage.setItem('teummeal-time',state.mealTime);else localStorage.removeItem('teummeal-time');
}

function renderSettings(){
  document.getElementById('nameInput').value=state.profile.name;
  document.getElementById('schoolInput').value=state.profile.school;
  document.getElementById('homeInput').value=state.profile.home;
  document.getElementById('academyInput').value=state.profile.academy;
  document.getElementById('learningCount').textContent=`선택 ${state.decisionHistory.length}개 · 제외 ${state.rejectedMenus.length}개`;
  updateLocationUI();
}

function applyProfile(){
  const hour=new Date().getHours();
  const name=state.profile.name.trim();
  document.getElementById('greeting').textContent=`좋은 ${hour<12?'아침':hour<18?'오후':'저녁'}이에요${name?`, ${name}님`:''}`;
  document.querySelector('.profile-button').textContent=name.charAt(0)||'T';
  const route=getActiveRoute();
  document.getElementById('routeDetail').textContent=route.point?'현재 위치를 따라 가까운 음식점이 바뀌어요':route.address?`${route.fromLabel} → ${route.toLabel} · ${route.address}`:'현재 위치를 켜거나 주소를 설정해 주세요';
  localStorage.setItem('teummeal-profile',JSON.stringify(state.profile));
  syncStudentMode();
}

function setResultFilter(filter){
  document.querySelectorAll('[data-result-filter]').forEach(button=>button.classList.toggle('active',button.dataset.resultFilter===filter));
  document.querySelectorAll('[data-result-kind]').forEach(card=>card.classList.toggle('filtered-out',filter!=='all'&&card.dataset.resultKind!==filter));
}

function updateLocationUI(message){
  const active=state.useCurrentLocation;
  const ready=active&&state.currentPosition;
  document.getElementById('locationToggle').classList.toggle('active',active);
  document.querySelectorAll('.current-location-button').forEach(button=>button.classList.toggle('active',ready));
  const nearbyLocation=document.getElementById('nearbyLocationFilter');nearbyLocation.classList.toggle('active',ready);nearbyLocation.setAttribute('aria-pressed',String(ready));
  document.getElementById('locationSettingStatus').textContent=message||(ready?`켜짐 · 약 ${Math.round(state.currentPosition.accuracy)}m 정확도`:active?'위치 권한을 확인하는 중이에요':'꺼짐 · 주소 기반으로 추천해요');
  document.getElementById('locationButtonTitle').textContent=ready?'현재 위치 반영 중':'현재 위치로 바로 추천';
  document.getElementById('locationButtonText').textContent=ready?'이동하면 가까운 음식점을 자동 갱신해요':'한 번만 허용하면 이동할 때 자동 반영해요';
}

function handlePosition(position){
  const next={lat:position.coords.latitude,lon:position.coords.longitude,accuracy:position.coords.accuracy};
  const moved=state.currentPosition?distanceMeters(state.currentPosition,next):Infinity;
  state.currentPosition=next;updateLocationUI();syncStudentMode();
  if(moved>200){state.nearbyPlaces=[];state.nearbyAddress='';const activePage=document.querySelector('.page.active')?.id;if(activePage==='nearbyPage')refreshLocationRecommendations();else loadLocationPlaces(false);}
}

function handlePositionError(error){
  const message=error.code===1?'위치 권한이 필요해요':error.code===3?'위치 확인 시간이 초과됐어요':'현재 위치를 확인할 수 없어요';
  state.useCurrentLocation=false;localStorage.setItem('teummeal-use-location','false');updateLocationUI(message);showToast(message);
}

function startLocationWatch(){
  if(!window.isSecureContext){showToast('현재 위치는 HTTPS 또는 localhost에서 사용할 수 있어요');return}
  if(!navigator.geolocation){handlePositionError({code:2});return}
  state.useCurrentLocation=true;localStorage.setItem('teummeal-use-location','true');updateLocationUI();
  if(state.locationWatchId!==null)navigator.geolocation.clearWatch(state.locationWatchId);
  state.locationWatchId=navigator.geolocation.watchPosition(handlePosition,handlePositionError,{enableHighAccuracy:false,maximumAge:30000,timeout:10000});
}

function stopLocationWatch(){
  if(state.locationWatchId!==null)navigator.geolocation.clearWatch(state.locationWatchId);
  state.locationWatchId=null;state.useCurrentLocation=false;state.currentPosition=null;state.nearbyPlaces=[];state.nearbyAddress='';localStorage.setItem('teummeal-use-location','false');updateLocationUI();syncStudentMode();
}

function updateProfileFromForm(){
  const form=document.getElementById('settingsForm');const data=new FormData(form);const oldAddress=getActiveRoute().address;
  state.profile={...state.profile,name:String(data.get('name')).trim(),school:String(data.get('school')).trim(),home:String(data.get('home')).trim(),academy:String(data.get('academy')).trim()};
  const newAddress=getActiveRoute().address;if(state.profile.geo?.address!==newAddress)delete state.profile.geo;
  if(oldAddress!==newAddress){state.nearbyPlaces=[];state.nearbyAddress=''}applyProfile();
}

function scheduleSettingsSync(){
  const status=document.getElementById('autoSaveStatus');status.className='auto-save-status saving';status.textContent='변경사항을 반영하는 중…';
  clearTimeout(state.settingsSaveTimer);state.settingsSaveTimer=setTimeout(async()=>{updateProfileFromForm();const places=await loadLocationPlaces(false);status.className='auto-save-status saved';status.textContent=places.length?`저장 완료 · 주변 음식점 ${places.length}곳 반영`:'저장 완료 · 기본 추천 사용 중';},1200);
}

function decide(menu){
  state.decisionHistory.unshift({menu,at:Date.now()});state.decisionHistory=state.decisionHistory.slice(0,50);state.rejectedMenus=state.rejectedMenus.filter(item=>item.menu!==menu);localStorage.removeItem('teummeal-decisions');localStorage.setItem('teummeal-decision-history',JSON.stringify(state.decisionHistory));localStorage.setItem('teummeal-rejected-menus',JSON.stringify(state.rejectedMenus));renderWeeklyCount();
  openModal(`<div style="font-size:45px">🎉</div><small style="color:var(--orange);font-weight:bold">오늘의 메뉴 결정 완료</small><h2>${menu}</h2><p>고민 끝! 친구에게 결정한 메뉴를 알려볼까요?</p><div class="modal-choice"><button data-action="shareDecision">친구에게 공유</button><button data-go="nearby">길 찾기</button></div><button class="modal-main" data-go="home">홈으로 돌아가기</button>`);
}

function rejectRecommendation(menu){
  state.rejectedMenus=state.rejectedMenus.filter(item=>item.menu!==menu);state.rejectedMenus.unshift({menu,at:Date.now()});state.rejectedMenus=state.rejectedMenus.slice(0,30);localStorage.setItem('teummeal-rejected-menus',JSON.stringify(state.rejectedMenus));showToast(`${menu}은 다음 추천에서 제외할게요`);renderRecommendations(state.lastRecommendation.custom,state.lastRecommendation.places);
}

function voteEmoji(name){
  if(/마라|라면|국수|우동|면/.test(name))return '🍜';if(/치킨|닭/.test(name))return '🍗';if(/피자/.test(name))return '🍕';if(/햄버거|버거/.test(name))return '🍔';if(/초밥|회/.test(name))return '🍣';if(/떡볶이|분식/.test(name))return '🍢';if(/밥|덮밥|김밥/.test(name))return '🍚';if(/파스타/.test(name))return '🍝';return '🍽️';
}

function saveVote(){
  if(state.vote)localStorage.setItem('teummeal-vote',JSON.stringify(state.vote));else localStorage.removeItem('teummeal-vote');
}

function setVoteSyncStatus(online,message){
  state.voteApiOnline=online;const element=document.getElementById('voteSyncStatus');if(!element)return;
  element.className=`vote-sync-status ${online?'online':'offline'}`;element.textContent=message||(online?'다른 기기와 동기화 중':'오프라인 · 마지막 상태 표시 중');
}

async function voteApi(path,options={}){
  const response=await fetchWithTimeout(`/api${path}`,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}},6000);
  let payload={};try{payload=await response.json()}catch(error){}
  if(!response.ok)throw new Error(payload.error||'투표 서버에 연결할 수 없어요');return payload;
}

function applyServerVote(vote){
  const choice=readNumber(`teummeal-vote-choice-${vote.id}`,-1);
  state.vote={...vote,myChoice:choice>=0?choice:null};saveVote();renderVotePage();
}

async function syncVoteFromServer(silent=false){
  if(!state.vote?.id)return;
  try{const payload=await voteApi(`/votes/${encodeURIComponent(state.vote.id)}`);applyServerVote(payload.vote);setVoteSyncStatus(true)}
  catch(error){setVoteSyncStatus(false);if(!silent)showToast(error.message)}
}

async function initializeVoteSync(){
  const voteId=new URLSearchParams(location.search).get('vote');
  if(voteId&&voteId!==state.vote?.id){state.vote={id:voteId,title:'투표를 불러오는 중…',candidates:[]};}
  if(voteId||state.vote?.id)await syncVoteFromServer(!voteId);
  state.votePollTimer=setInterval(()=>{if(document.visibilityState==='visible'&&document.getElementById('votePage').classList.contains('active'))syncVoteFromServer(true)},2500);
}

async function shareVote(){
  if(!state.vote?.id){showToast('서버에 저장된 투표만 친구에게 공유할 수 있어요');return}
  const url=`${location.origin}${location.pathname}?vote=${encodeURIComponent(state.vote.id)}`;const data={title:state.vote.title,text:'틈밥에서 메뉴 투표해 줘!',url};
  try{if(navigator.share)await navigator.share(data);else{await navigator.clipboard.writeText(url);showToast('실시간 투표 링크를 복사했어요')}}catch(error){if(error.name!=='AbortError')showToast('링크를 복사하지 못했어요')}
}

async function submitVoteSelection(index){
  if(!state.vote?.id){showToast('이전 로컬 투표는 새로 만들어 주세요');return}
  const previous=state.vote.myChoice;if(previous===index)return;
  state.vote.myChoice=index;localStorage.setItem(`teummeal-vote-choice-${state.vote.id}`,String(index));renderVotePage();
  try{const payload=await voteApi(`/votes/${encodeURIComponent(state.vote.id)}/vote`,{method:'POST',body:JSON.stringify({voterId:state.voterId,candidateIndex:index})});applyServerVote(payload.vote);setVoteSyncStatus(true);showToast('내 선택을 실시간 반영했어요')}
  catch(error){state.vote.myChoice=previous;if(previous===null)localStorage.removeItem(`teummeal-vote-choice-${state.vote.id}`);else localStorage.setItem(`teummeal-vote-choice-${state.vote.id}`,String(previous));renderVotePage();setVoteSyncStatus(false);showToast(error.message)}
}

async function deleteCurrentVote(){
  const id=state.vote?.id;
  try{if(id)await voteApi(`/votes/${encodeURIComponent(id)}`,{method:'DELETE'});if(id)localStorage.removeItem(`teummeal-vote-choice-${id}`);state.vote=null;saveVote();renderVotePage();closeModal();showToast('투표를 삭제했어요')}
  catch(error){setVoteSyncStatus(false);showToast(error.message)}
}

function renderVotePage(){
  const valid=state.vote?.title&&state.vote?.candidates?.length>=2;
  document.getElementById('voteEmpty').classList.toggle('hidden',!!valid);
  document.getElementById('voteActive').classList.toggle('hidden',!valid);
  if(!valid)return;
  const total=state.vote.candidates.reduce((sum,item)=>sum+item.votes,0);const participants=state.vote.participants??total;
  document.getElementById('voteTitle').textContent=state.vote.title;
  document.getElementById('voteStatus').textContent=total?'LIVE':'WAITING';
  document.getElementById('voteMeta').textContent=participants?`${participants}명 참여 · 실시간 투표`:'아직 친구가 참여하지 않았어요 · 직접 만든 투표';
  setVoteSyncStatus(!!state.vote.id&&state.voteApiOnline,state.vote.id?(state.voteApiOnline?'다른 기기와 실시간 동기화 중':'서버 연결 확인 중'):'이 기기에만 저장된 이전 투표');
  document.getElementById('voteList').innerHTML=state.vote.candidates.map((item,index)=>{
    const percent=total?Math.round(item.votes/total*100):0;const selected=state.vote.myChoice===index;
    return `<button class="vote-option ${selected?'selected':''}" data-vote-index="${index}" aria-pressed="${selected}"><span class="food-emoji">${voteEmoji(item.name)}</span><div><strong>${escapeHtml(item.name)}</strong><small>${selected?'내가 선택한 메뉴':'눌러서 투표하기'}</small><i><b style="width:${percent}%"></b></i></div><em>${item.votes}표</em></button>`;
  }).join('');
}

function openCreateVote(){
  openModal('<h2>새 메뉴 투표</h2><p>직접 입력한 내용으로만 투표가 만들어져요.</p><form class="modal-form" id="createVoteForm"><label>투표 제목<input name="title" maxlength="30" placeholder="예: 토요일 점심 뭐 먹을까?" required></label><label>메뉴 후보<input name="candidates" placeholder="예: 떡볶이, 햄버거, 초밥" required></label><small>쉼표로 구분해 최소 2개를 입력해 주세요.</small><button class="modal-main" type="submit">투표 만들기</button></form>');
}

function openCandidateForm(){
  openModal('<h2>메뉴 후보 추가</h2><p>새로 제안할 메뉴를 직접 입력해 주세요.</p><form class="modal-form" id="candidateForm"><label>메뉴 이름<input name="candidate" maxlength="20" placeholder="예: 마라탕" required></label><button class="modal-main" type="submit">후보 추가하기</button></form>');
}

document.addEventListener('click',e=>{
  const goButton=e.target.closest('[data-go]'); if(goButton){closeModal();go(goButton.dataset.go);return}
  const action=e.target.closest('[data-action]')?.dataset.action;
  if(action==='recommend') recommendByContext();
  if(action==='random') { const m=menus[Math.floor(Math.random()*menus.length)]; decide(m.name); }
  if(action==='cook') recommendByContext(state.ingredients);
  if(action==='decide') decide(e.target.closest('[data-menu]').dataset.menu);
  if(action==='reject') rejectRecommendation(e.target.closest('[data-menu]').dataset.menu);
  if(action==='closeModal') closeModal();
  if(action==='share') shareVote();
  if(action==='shareDecision'){navigator.clipboard?.writeText(`틈밥에서 오늘 메뉴를 결정했어요!${state.profile.name?` - ${state.profile.name}`:''}`);showToast('결정 내용을 복사했어요');closeModal()}
  if(action==='createVote') openCreateVote();
  if(action==='addCandidate') openCandidateForm();
  if(action==='deleteVote') openModal('<h2>투표를 삭제할까요?</h2><p>후보와 투표 기록이 모두 사라지며 되돌릴 수 없어요.</p><button class="modal-main" data-action="confirmDeleteVote">투표 삭제</button>');
  if(action==='confirmDeleteVote') deleteCurrentVote();
  if(action==='filter') openModal('<h2>추천 조건</h2><p>지금 상황에 맞게 바꿀 수 있어요.</p><div class="modal-choice"><button>도보 10분</button><button>1만원 이하</button><button>영업 중</button><button>평점 4.5+</button></div><button class="modal-main" data-action="closeModal">조건 적용하기</button>');
  if(action==='currentLocation') { if(state.useCurrentLocation&&state.currentPosition){state.nearbyPlaces=[];state.nearbyAddress='';loadLocationPlaces(document.querySelector('.page.active')?.id==='nearbyPage');showToast('현재 위치로 추천을 갱신해요')}else startLocationWatch(); }
  if(action==='toggleLocation') { state.useCurrentLocation?stopLocationWatch():startLocationWatch(); }
  if(action==='retryPlaces'){state.nearbyPlaces=[];state.nearbyAddress='';refreshLocationRecommendations()}
  if(action==='clearLearning') openModal('<h2>추천 기록을 초기화할까요?</h2><p>선택·제외 기록이 삭제되고 추천이 처음 상태로 돌아가요.</p><button class="modal-main" data-action="confirmClearLearning">추천 기록 초기화</button>');
  if(action==='confirmClearLearning'){state.decisionHistory=[];state.rejectedMenus=[];localStorage.removeItem('teummeal-decisions');localStorage.removeItem('teummeal-decision-history');localStorage.removeItem('teummeal-rejected-menus');renderWeeklyCount();renderSettings();closeModal();showToast('추천 학습 기록을 초기화했어요')}
  if(action==='clearLocations') openModal('<h2>저장된 주소를 삭제할까요?</h2><p>학교·집·학원 주소와 변환된 좌표가 이 기기에서 삭제돼요.</p><button class="modal-main" data-action="confirmClearLocations">주소 삭제</button>');
  if(action==='confirmClearLocations'){stopLocationWatch();state.profile={...state.profile,school:'',home:'',academy:''};delete state.profile.geo;state.nearbyPlaces=[];state.nearbyAddress='';applyProfile();renderSettings();closeModal();showToast('저장된 주소를 삭제했어요')}
  if(action==='clearAllData') openModal('<h2>모든 앱 데이터를 삭제할까요?</h2><p>프로필·주소·냉장고·추천 기록과 이 기기의 투표 선택이 모두 삭제돼요. 공유 투표방 자체는 유지됩니다.</p><button class="modal-main" data-action="confirmClearAllData">모든 데이터 삭제</button>');
  if(action==='confirmClearAllData'){if(state.locationWatchId!==null)navigator.geolocation.clearWatch(state.locationWatchId);localStorage.clear();location.replace(location.pathname)}
  const remove=e.target.closest('[data-remove]'); if(remove){state.ingredients.splice(Number(remove.dataset.remove),1);renderIngredients()}
  const suggestion=e.target.closest('.suggestions button'); if(suggestion)addIngredient(suggestion.textContent);
  const nearbyFilter=e.target.closest('[data-nearby-filter]');if(nearbyFilter)changeNearbyFilter(nearbyFilter.dataset.nearbyFilter);
  const time=e.target.closest('[data-time]'); if(time){state.mealTime=Number(time.dataset.time);syncStudentMode();showToast(`${state.mealTime}분 안에 먹을 메뉴로 맞췄어요`)}
  const budget=e.target.closest('[data-budget]'); if(budget){state.budget=Number(budget.dataset.budget);syncStudentMode();showToast(`${state.budget.toLocaleString('ko-KR')}원 예산으로 맞췄어요`)}
  const resultFilter=e.target.closest('[data-result-filter]');if(resultFilter)setResultFilter(resultFilter.dataset.resultFilter);
  const mapCard=e.target.closest('[data-map-index]');if(mapCard&&!e.target.closest('[data-action="decide"]'))focusMapPlace(Number(mapCard.dataset.mapIndex));
  const vote=e.target.closest('[data-vote-index]');if(vote&&state.vote)submitVoteSelection(Number(vote.dataset.voteIndex));
});

document.addEventListener('submit',async e=>{
  if(e.target.id==='createVoteForm'){
    e.preventDefault();const data=new FormData(e.target);const candidates=String(data.get('candidates')).split(',').map(value=>value.trim()).filter(Boolean).filter((value,index,array)=>array.indexOf(value)===index);
    if(candidates.length<2){showToast('메뉴 후보를 2개 이상 입력해 주세요');return}
    try{const payload=await voteApi('/votes',{method:'POST',body:JSON.stringify({title:String(data.get('title')).trim(),candidates})});applyServerVote(payload.vote);setVoteSyncStatus(true);history.replaceState(null,'',`${location.pathname}?vote=${encodeURIComponent(payload.vote.id)}`);closeModal();showToast('실시간 투표를 만들었어요')}catch(error){setVoteSyncStatus(false);showToast(error.message)}
  }
  if(e.target.id==='candidateForm'){
    e.preventDefault();const name=String(new FormData(e.target).get('candidate')).trim();if(!name||!state.vote)return;if(state.vote.candidates.some(item=>item.name===name)){showToast('이미 있는 후보예요');return}
    if(!state.vote.id){showToast('이전 로컬 투표는 새로 만들어 주세요');return}
    try{const payload=await voteApi(`/votes/${encodeURIComponent(state.vote.id)}/candidates`,{method:'POST',body:JSON.stringify({name})});applyServerVote(payload.vote);setVoteSyncStatus(true);closeModal();showToast(`${name}을 후보에 추가했어요`)}catch(error){setVoteSyncStatus(false);showToast(error.message)}
  }
});

document.getElementById('ingredientForm').addEventListener('submit',e=>{e.preventDefault();addIngredient(document.getElementById('ingredientInput').value);e.target.reset()});
document.getElementById('budgetInput').addEventListener('change',e=>{const raw=e.target.value.trim();state.budget=raw?Math.max(1000,Math.min(50000,Number(raw))):null;syncStudentMode();showToast(state.budget?`${state.budget.toLocaleString('ko-KR')}원 예산으로 맞췄어요`:'예산 선택을 비웠어요')});
document.getElementById('settingsForm').addEventListener('submit',e=>{
  e.preventDefault();
  clearTimeout(state.settingsSaveTimer);updateProfileFromForm();showToast('내 정보를 저장했어요');setTimeout(()=>go('home'),350);
});
document.getElementById('settingsForm').addEventListener('input',scheduleSettingsSync);
document.getElementById('modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal()});
window.addEventListener('online',()=>{showToast('인터넷이 다시 연결됐어요');syncVoteFromServer(true);if(document.getElementById('nearbyPage').classList.contains('active'))refreshLocationRecommendations()});
window.addEventListener('offline',()=>{showToast('오프라인 상태예요 · 저장된 정보만 사용할게요');setVoteSyncStatus(false)});
renderWeeklyCount();renderIngredients();renderVotePage();syncStudentMode();applyProfile();updateLocationUI();initializeVoteSync();if(state.useCurrentLocation)startLocationWatch();
