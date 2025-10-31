let currentUser = null;
let sessionId = localStorage.getItem('sessionId');
let availableSports = [];
let activityFeed = [];
let userWorkouts = [];
let isEditMode = false;
let editingWorkoutId = null;
let currentSessionExercises = [];
let progressPeriod = 'month';
let charts = {};
let feedDisplayCount = 10;

const API_BASE = '';

async function request(endpoint, options = {}) {
  try {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    
    if (sessionId && !options.skipAuth) {
      headers['x-session-id'] = sessionId;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      if (response.status === 401 && !options.skipAuth) {
        sessionId = null;
        currentUser = null;
        localStorage.removeItem('sessionId');
        showLogin();
        throw new Error('Authentication required');
      }
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (e) {
    console.error('API Error:', e);
    throw e;
  }
}

const api = {
  auth: {
    register: (data) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(data), skipAuth: true }),
    login: (data) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(data), skipAuth: true }),
    logout: () => request('/api/auth/logout', { method: 'POST' }),
    getMe: () => request('/api/auth/me')
  },
  sports: {
    list: () => request('/api/sports', { skipAuth: true })
  },
  exercises: {
    list: () => request('/api/exercises', { skipAuth: true })
  },
  workouts: {
    create: (data) => request('/api/workouts', { method: 'POST', body: JSON.stringify(data) }),
    createSession: (data) => request('/api/workout-sessions', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/api/workouts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    mine: () => request('/api/workouts/mine'),
    feed: () => request('/api/workouts/feed'),
    like: (id) => request(`/api/workouts/${id}/like`, { method: 'POST' }),
    stats: (period) => request(`/api/workouts/stats?period=${period}`),
    sportDistribution: (period) => request(`/api/workouts/sport-distribution?period=${period}`),
    delete: (id) => request(`/api/workouts/${id}`, { method: 'DELETE' })
  },
  profile: {
    update: (data) => request('/api/user/profile', { method: 'PUT', body: JSON.stringify(data) })
  },
  users: {
    search: (query) => request(`/api/users/search?query=${encodeURIComponent(query || '')}`),
    follow: (userId) => request(`/api/users/${userId}/follow`, { method: 'POST' })
  }
};

async function initializeApp() {
  try {
    availableSports = await api.sports.list();
    renderSportsCheckboxes();
  } catch (e) {
    console.error('Failed to load sports:', e);
  }

  if (sessionId) {
    try {
      currentUser = await api.auth.getMe();
      showApp();
      await Promise.all([
        loadUserWorkouts(),
        loadActivityFeed()
      ]);
      navigateTo('home');
    } catch (e) {
      console.error('Auto-login failed:', e);
      sessionId = null;
      localStorage.removeItem('sessionId');
      showLogin();
    }
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-screen').classList.add('active');
  document.getElementById('app-container').classList.remove('active');
  switchTab('login');
}

function showApp() {
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('app-container').classList.add('active');
}

function renderSportsCheckboxes() {
  const registerContainer = document.getElementById('register-sports-checkboxes');
  const profileContainer = document.getElementById('sports-checkboxes');
  
  const html = availableSports.map(sport => `
    <div class="sport-checkbox-item" onclick="toggleSportCheckbox('${sport.name}')">
      <input type="checkbox" id="sport-${sport.name}" value="${sport.name}" onclick="event.stopPropagation(); toggleSportCheckbox('${sport.name}')">
      <label for="sport-${sport.name}">${sport.name}</label>
    </div>
  `).join('');
  
  if (registerContainer) registerContainer.innerHTML = html;
  if (profileContainer) profileContainer.innerHTML = html;
}

function toggleSportCheckbox(sportName) {
  const checkbox = document.getElementById(`sport-${sportName}`);
  if (checkbox) {
    checkbox.checked = !checkbox.checked;
    checkbox.parentElement.classList.toggle('selected', checkbox.checked);
  }
}

function getSelectedSports() {
  const checkboxes = document.querySelectorAll('.sport-checkbox-item input[type="checkbox"]:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

function setSelectedSports(sports) {
  document.querySelectorAll('.sport-checkbox-item').forEach(item => {
    const checkbox = item.querySelector('input[type="checkbox"]');
    const isSelected = sports.includes(checkbox.value);
    checkbox.checked = isSelected;
    item.classList.toggle('selected', isSelected);
  });
}

function switchTab(mode) {
  const isLoginMode = (mode === 'login');
  const tabs = document.querySelectorAll('.auth-tabs .tab-btn');
  tabs[0].classList.toggle('active', isLoginMode);
  tabs[1].classList.toggle('active', !isLoginMode);
  
  document.getElementById('name-field').style.display = isLoginMode ? 'none' : 'block';
  document.getElementById('sport-field').style.display = isLoginMode ? 'none' : 'block';
  document.getElementById('weekly-goal-field').style.display = isLoginMode ? 'none' : 'block';
  document.getElementById('auth-submit-btn').textContent = isLoginMode ? 'Login' : 'Register';
}

function updateRegisterGoalDisplay(value) {
  document.getElementById('register-goal-value').textContent = `${value} workout${value > 1 ? 's' : ''}/week`;
}

async function handleLogin(event) {
  event.preventDefault();
  
  const email = document.getElementById('email-input').value;
  const password = document.getElementById('password-input').value;
  const name = document.getElementById('name-input').value;
  const isLoginMode = document.getElementById('auth-submit-btn').textContent === 'Login';
  
  try {
    let result;
    
    if (isLoginMode) {
      result = await api.auth.login({ email, password });
    } else {
      const sports = getSelectedSports();
      
      if (sports.length === 0) {
        alert('Please select at least one sport interest');
        return;
      }
      
      const weeklyGoal = parseInt(document.getElementById('register-weekly-goal-slider').value);
      result = await api.auth.register({ name, email, password, sports, weeklyGoal });
    }
    
    sessionId = result.sessionId;
    localStorage.setItem('sessionId', sessionId);
    currentUser = result.user;
    
    showApp();
    await Promise.all([
      loadUserWorkouts(),
      loadActivityFeed()
    ]);
    navigateTo('home');
    
    document.getElementById('auth-form').reset();
  } catch (e) {
    alert(e.message || 'Authentication failed. Please try again.');
  }
}

async function handleLogout() {
  if (!confirm('Are you sure you want to logout?')) return;
  
  try {
    await api.auth.logout();
  } catch (e) {
    console.error('Logout error:', e);
  }
  
  sessionId = null;
  currentUser = null;
  localStorage.removeItem('sessionId');
  
  showLogin();
  switchTab('login');
}

function navigateTo(screen) {
  const navBtns = document.querySelectorAll('.nav-btn, .mobile-nav-btn');
  navBtns.forEach(btn => btn.classList.remove('active'));
  
  const screenMap = { 'home': 0, 'workouts': 1, 'progress': 2, 'profile': 3 };
  const index = screenMap[screen];
  
  if (index !== undefined) {
    document.querySelectorAll('.nav-btn')[index]?.classList.add('active');
    document.querySelectorAll('.mobile-nav-btn')[index]?.classList.add('active');
  }
  
  document.querySelectorAll('.page-content').forEach(page => page.classList.remove('active'));
  document.getElementById(`${screen}-screen`)?.classList.add('active');
  
  if (screen === 'home') {
    renderActivityFeed();
  } else if (screen === 'workouts') {
    renderWorkouts();
  } else if (screen === 'progress') {
    initializeCharts();
  } else if (screen === 'profile') {
    renderProfile();
  } else if (screen === 'search') {
    document.getElementById('search-screen')?.classList.add('active');
    filterAthletes();
  }
}

async function loadActivityFeed() {
  try {
    activityFeed = await api.workouts.feed();
    renderActivityFeed();
  } catch (e) {
    console.error('Failed to load activity feed:', e);
    activityFeed = [];
  }
}

function renderActivityFeed() {
  const feedContainer = document.getElementById('activity-feed');
  if (!feedContainer) return;
  
  if (activityFeed.length === 0) {
    feedContainer.innerHTML = '<div class="card"><p>No workouts to show yet. Start logging your workouts or select more sport interests!</p></div>';
    return;
  }
  
  feedContainer.innerHTML = '';
  
  const itemsToShow = activityFeed.slice(0, feedDisplayCount);
  
  itemsToShow.forEach(item => {
    const feedItem = document.createElement('div');
    feedItem.className = 'feed-item';
    feedItem.innerHTML = `
      <div class="feed-header">
        <img src="${item.avatar}" alt="${item.author}" class="feed-avatar">
        <div class="feed-author">
          <h3>${item.author}</h3>
          <p>${item.sport} • ${item.time}</p>
        </div>
      </div>
      <div class="feed-content">
        <h4>${item.workout}</h4>
        <p>${item.stats}</p>
        ${item.notes ? `<p style="color: #b5b5b5; font-style: italic; margin-top: 8px;">"${item.notes}"</p>` : ''}
      </div>
      <div class="feed-actions">
        <button class="like-btn ${item.liked ? 'liked' : ''}" onclick="toggleLike('${item.id}', 'feed')">
          ${item.liked ? '❤️' : '🤍'} ${item.likes}
        </button>
      </div>
    `;
    feedContainer.appendChild(feedItem);
  });
  
  if (activityFeed.length > feedDisplayCount) {
    const viewMoreBtn = document.createElement('button');
    viewMoreBtn.className = 'btn-secondary full-width';
    viewMoreBtn.textContent = `View More (${activityFeed.length - feedDisplayCount} more workouts)`;
    viewMoreBtn.style.marginTop = '16px';
    viewMoreBtn.onclick = loadMoreFeedItems;
    feedContainer.appendChild(viewMoreBtn);
  }
}

function loadMoreFeedItems() {
  feedDisplayCount += 10;
  renderActivityFeed();
}

async function toggleLike(id, source) {
  try {
    const result = await api.workouts.like(id);
    
    if (source === 'feed') {
      const item = activityFeed.find(i => i.id == id);
      if (item) {
        item.liked = result.liked;
        item.likes += result.liked ? 1 : -1;
        renderActivityFeed();
      }
    } else {
      const item = userWorkouts.find(i => i.id == id);
      if (item) {
        item.liked = result.liked;
        item.likes += result.liked ? 1 : -1;
        renderWorkouts();
      }
    }
  } catch (e) {
    console.error('Failed to toggle like:', e);
  }
}

function toggleWorkoutForm() {
  const form = document.getElementById('workout-form');
  const isVisible = form.style.display !== 'none';
  
  if (isVisible) {
    editingWorkoutId = null;
    currentSessionExercises = [];
    updateSessionExercisesList();
    form.querySelector('h2').textContent = 'New Workout';
    document.getElementById('personal-record-toggle').disabled = false;
    document.getElementById('personal-record-toggle').checked = false;
  }
  
  form.style.display = isVisible ? 'none' : 'block';
  document.getElementById('form-toggle-text').textContent = isVisible ? '+ Log Workout' : 'Cancel';
}

function addExerciseToSession(event) {
  event.preventDefault();
  
  const exercise = {
    exercise: document.getElementById('exercise-name').value,
    sport: document.getElementById('workout-sport').value,
    sets: document.getElementById('workout-sets').value || null,
    reps: document.getElementById('workout-reps').value || null,
    distance: document.getElementById('workout-distance').value || null,
    duration: document.getElementById('workout-duration').value || null,
    notes: document.getElementById('workout-notes').value || null
  };
  
  currentSessionExercises.push(exercise);
  updateSessionExercisesList();
  
  document.getElementById('exercise-name').value = '';
  document.getElementById('workout-sets').value = '';
  document.getElementById('workout-reps').value = '';
  document.getElementById('workout-distance').value = '';
  document.getElementById('workout-duration').value = '';
  document.getElementById('workout-notes').value = '';
  document.getElementById('personal-record-toggle').checked = false;
  document.getElementById('personal-record-toggle').disabled = true;
  
  document.getElementById('exercise-name').focus();
}

function removeExerciseFromSession(index) {
  currentSessionExercises.splice(index, 1);
  updateSessionExercisesList();
  
  if (currentSessionExercises.length === 0) {
    document.getElementById('personal-record-toggle').disabled = false;
  }
}

function updateSessionExercisesList() {
  const listContainer = document.getElementById('session-exercises-list');
  const container = document.getElementById('session-exercises-container');
  const countSpan = document.getElementById('session-exercise-count');
  
  if (currentSessionExercises.length === 0) {
    listContainer.style.display = 'none';
    return;
  }
  
  listContainer.style.display = 'block';
  countSpan.textContent = `${currentSessionExercises.length} exercise${currentSessionExercises.length > 1 ? 's' : ''}`;
  
  container.innerHTML = currentSessionExercises.map((ex, index) => {
    const stats = [];
    if (ex.sets) stats.push(`${ex.sets} sets`);
    if (ex.reps) stats.push(`${ex.reps} reps`);
    if (ex.distance) stats.push(ex.distance);
    if (ex.duration) stats.push(ex.duration);
    
    return `
      <div style="background: #1c1c1c; padding: 12px; border-radius: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: start;">
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 4px;">${ex.exercise} <span style="background: #2a2a2a; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-left: 8px;">${ex.sport}</span></div>
          ${stats.length > 0 ? `<div style="color: #b5b5b5; font-size: 14px;">${stats.join(' • ')}</div>` : ''}
          ${ex.notes ? `<div style="color: #b5b5b5; font-size: 13px; font-style: italic; margin-top: 4px;">"${ex.notes}"</div>` : ''}
        </div>
        <button type="button" onclick="removeExerciseFromSession(${index})" style="background: none; border: none; color: #ff6b6b; cursor: pointer; font-size: 18px; padding: 0 8px;">×</button>
      </div>
    `;
  }).join('');
}

async function saveAllExercises() {
  if (currentSessionExercises.length === 0) {
    alert('Please add at least one exercise first.');
    return;
  }
  
  const workoutDate = document.getElementById('workout-date').value || null;
  
  try {
    const session = await api.workouts.createSession({
      exercises: currentSessionExercises,
      workoutDate
    });
    
    userWorkouts.unshift(session);
    
    currentSessionExercises = [];
    updateSessionExercisesList();
    document.getElementById('workout-form').querySelector('form').reset();
    toggleWorkoutForm();
    renderWorkouts();
    updateWeeklyProgress();
    
    await loadActivityFeed();
    alert(`Successfully saved ${session.exercises.length} exercise${session.exercises.length > 1 ? 's' : ''}!`);
  } catch (e) {
    alert('Failed to save exercises: ' + e.message);
  }
}

async function saveWorkout(event) {
  if (event) event.preventDefault();
  
  const exercise = document.getElementById('exercise-name').value;
  const sport = document.getElementById('workout-sport').value;
  const sets = document.getElementById('workout-sets').value || null;
  const reps = document.getElementById('workout-reps').value || null;
  const distance = document.getElementById('workout-distance').value || null;
  const duration = document.getElementById('workout-duration').value || null;
  const notes = document.getElementById('workout-notes').value || null;
  const workoutDate = document.getElementById('workout-date').value || null;
  const isPersonalRecord = document.getElementById('personal-record-toggle').checked;
  
  if (!exercise) {
    if (currentSessionExercises.length > 0) {
      await saveAllExercises();
    } else {
      alert('Please enter an exercise name.');
    }
    return;
  }
  
  try {
    if (editingWorkoutId) {
      const updatedWorkout = await api.workouts.update(editingWorkoutId, {
        exercise, sport, sets, reps, distance, duration, notes, workoutDate, isPersonalRecord
      });
      
      const index = userWorkouts.findIndex(w => w.id == editingWorkoutId);
      if (index !== -1) {
        userWorkouts[index] = updatedWorkout;
      }
      editingWorkoutId = null;
      
      document.getElementById('workout-form').querySelector('form').reset();
      document.getElementById('personal-record-toggle').disabled = false;
      toggleWorkoutForm();
      renderWorkouts();
      renderPersonalRecords();
      updateWeeklyProgress();
      await loadActivityFeed();
      await initializeCharts();
    } else {
      if (currentSessionExercises.length > 0) {
        currentSessionExercises.push({
          exercise,
          sport,
          sets,
          reps,
          distance,
          duration,
          notes
        });
        await saveAllExercises();
      } else {
        const newWorkout = await api.workouts.create({
          exercise, sport, sets, reps, distance, duration, notes, workoutDate, isPersonalRecord
        });
        
        userWorkouts.unshift(newWorkout);
        document.getElementById('workout-form').querySelector('form').reset();
        document.getElementById('personal-record-toggle').disabled = false;
        toggleWorkoutForm();
        renderWorkouts();
        renderPersonalRecords();
        updateWeeklyProgress();
        await loadActivityFeed();
      }
    }
  } catch (e) {
    alert('Failed to save workout: ' + e.message);
  }
}

async function loadUserWorkouts() {
  try {
    userWorkouts = await api.workouts.mine();
    renderWorkouts();
  } catch (e) {
    console.error('Failed to load workouts:', e);
    userWorkouts = [];
  }
}

function editWorkout(workoutId) {
  const workout = userWorkouts.find(w => w.id == workoutId);
  if (!workout) return;
  
  editingWorkoutId = workoutId;
  
  document.getElementById('exercise-name').value = workout.exercise;
  document.getElementById('workout-sport').value = workout.sport;
  document.getElementById('workout-sets').value = workout.sets !== '-' ? workout.sets : '';
  document.getElementById('workout-reps').value = workout.reps !== '-' ? workout.reps : '';
  document.getElementById('workout-distance').value = workout.distance !== '-' ? workout.distance : '';
  document.getElementById('workout-duration').value = workout.duration !== '-' ? workout.duration : '';
  document.getElementById('workout-notes').value = workout.notes || '';
  document.getElementById('workout-date').value = '';
  document.getElementById('personal-record-toggle').checked = workout.isPersonalRecord || false;
  
  const form = document.getElementById('workout-form');
  form.style.display = 'block';
  form.querySelector('h2').textContent = 'Edit Workout';
  document.getElementById('form-toggle-text').textContent = 'Cancel';
  
  window.scrollTo({ top: form.offsetTop - 20, behavior: 'smooth' });
}

async function deleteWorkout(workoutId) {
  if (!confirm('Are you sure you want to delete this workout?')) {
    return;
  }
  
  try {
    await api.workouts.delete(workoutId);
    userWorkouts = userWorkouts.filter(w => w.id != workoutId);
    renderWorkouts();
    await loadActivityFeed();
    await initializeCharts();
  } catch (e) {
    alert('Failed to delete workout: ' + e.message);
  }
}

function renderWorkouts() {
  const container = document.getElementById('workouts-list');
  if (!container) return;
  
  if (userWorkouts.length === 0) {
    container.innerHTML = '<div class="card"><p>No workouts logged yet. Click "Log Workout" to add your first session!</p></div>';
    return;
  }
  
  container.innerHTML = '';
  
  userWorkouts.forEach((item, itemIndex) => {
    const workoutItem = document.createElement('div');
    workoutItem.className = 'workout-item';
    
    if (item.sessionId && item.exercises) {
      const carouselId = `carousel-${item.sessionId}`;
      const exercises = item.exercises;
      
      workoutItem.innerHTML = `
        <div class="workout-header">
          <div class="workout-title-section">
            <div class="workout-title-row">
              <h3>Workout Session</h3>
              <span class="session-badge">${exercises.length} Exercise${exercises.length > 1 ? 's' : ''}</span>
            </div>
            <div class="workout-meta">
              <span>📅 ${item.date}</span>
              <span>🕐 ${item.time}</span>
            </div>
          </div>
        </div>
        <div class="carousel-container" id="${carouselId}">
          ${exercises.map((exercise, index) => {
            const statsHTML = [];
            if (exercise.sets && exercise.sets !== '-') {
              statsHTML.push(`<div class="workout-stat"><p>Sets</p><p>${exercise.sets}</p></div>`);
            }
            if (exercise.reps && exercise.reps !== '-') {
              statsHTML.push(`<div class="workout-stat"><p>Reps</p><p>${exercise.reps}</p></div>`);
            }
            if (exercise.distance && exercise.distance !== '-') {
              statsHTML.push(`<div class="workout-stat"><p>Distance</p><p>${exercise.distance}</p></div>`);
            }
            if (exercise.duration && exercise.duration !== '-') {
              statsHTML.push(`<div class="workout-stat"><p>Duration</p><p>${exercise.duration}</p></div>`);
            }
            
            return `
              <div class="carousel-slide ${index === 0 ? 'active' : ''}" data-slide="${index}">
                <div class="exercise-info">
                  <div class="exercise-title-row">
                    <h4>${exercise.exercise}</h4>
                    <span class="sport-badge">${exercise.sport}</span>
                  </div>
                  <div class="workout-stats">
                    ${statsHTML.join('')}
                  </div>
                  ${exercise.notes ? `
                    <div class="workout-notes">
                      <p>Notes</p>
                      <p>${exercise.notes}</p>
                    </div>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
        ${exercises.length > 1 ? `
          <div class="carousel-controls">
            <button class="carousel-btn prev" onclick="changeSlide('${carouselId}', -1)">‹</button>
            <span class="carousel-indicator">
              <span class="current-slide">1</span> / ${exercises.length}
            </span>
            <button class="carousel-btn next" onclick="changeSlide('${carouselId}', 1)">›</button>
          </div>
        ` : ''}
        <div class="feed-actions">
          <button class="like-btn" onclick="alert('Coming soon!')">
            🤍 0
          </button>
        </div>
      `;
    } else {
      const statsHTML = [];
      if (item.sets && item.sets !== '-') {
        statsHTML.push(`<div class="workout-stat"><p>Sets</p><p>${item.sets}</p></div>`);
      }
      if (item.reps && item.reps !== '-') {
        statsHTML.push(`<div class="workout-stat"><p>Reps</p><p>${item.reps}</p></div>`);
      }
      if (item.distance && item.distance !== '-') {
        statsHTML.push(`<div class="workout-stat"><p>Distance</p><p>${item.distance}</p></div>`);
      }
      if (item.duration && item.duration !== '-') {
        statsHTML.push(`<div class="workout-stat"><p>Duration</p><p>${item.duration}</p></div>`);
      }
      
      workoutItem.innerHTML = `
        <div class="workout-header">
          <div class="workout-title-section">
            <div class="workout-title-row">
              <h3>${item.exercise}</h3>
              <span class="sport-badge">${item.sport}</span>
            </div>
            <div class="workout-meta">
              <span>📅 ${item.date}</span>
              <span>🕐 ${item.time}</span>
            </div>
          </div>
        </div>
        <div class="workout-stats">
          ${statsHTML.join('')}
        </div>
        ${item.notes ? `
          <div class="workout-notes">
            <p>Notes</p>
            <p>${item.notes}</p>
          </div>
        ` : ''}
        <div class="feed-actions">
          <button class="like-btn ${item.liked ? 'liked' : ''}" onclick="toggleLike('${item.id}', 'workout')">
            ${item.liked ? '❤️' : '🤍'} ${item.likes}
          </button>
          <button class="edit-btn" onclick="editWorkout('${item.id}')" title="Edit workout">
            ✏️ Edit
          </button>
          <button class="delete-btn" onclick="deleteWorkout('${item.id}')" title="Delete workout">
            🗑️ Delete
          </button>
        </div>
      `;
    }
    
    container.appendChild(workoutItem);
  });
}

function changeSlide(carouselId, direction) {
  const carousel = document.getElementById(carouselId);
  if (!carousel) return;
  
  const slides = carousel.querySelectorAll('.carousel-slide');
  let currentIndex = Array.from(slides).findIndex(slide => slide.classList.contains('active'));
  
  slides[currentIndex].classList.remove('active');
  
  currentIndex += direction;
  if (currentIndex >= slides.length) currentIndex = 0;
  if (currentIndex < 0) currentIndex = slides.length - 1;
  
  slides[currentIndex].classList.add('active');
  
  const indicator = carousel.parentElement.querySelector('.current-slide');
  if (indicator) {
    indicator.textContent = currentIndex + 1;
  }
}

function setProgressPeriod(period) {
  progressPeriod = period;
  
  const buttons = document.querySelectorAll('.filter-btn');
  buttons.forEach(btn => btn.classList.remove('active'));
  
  if (period === 'week') buttons[0].classList.add('active');
  else if (period === 'month') buttons[1].classList.add('active');
  else buttons[2].classList.add('active');
  
  initializeCharts();
}

async function initializeCharts() {
  try {
    const stats = await api.workouts.stats(progressPeriod === 'all' ? null : progressPeriod);
    const sportDist = await api.workouts.sportDistribution(progressPeriod === 'all' ? null : progressPeriod);
    
    if (stats.length === 0) {
      const emptyMessage = '<div style="text-align: center; padding: 40px; color: #b5b5b5;">No workout data yet. Start logging workouts to see your progress!</div>';
      const freqCard = document.getElementById('frequency-chart')?.parentElement;
      const sportCard = document.getElementById('sport-distribution-chart')?.parentElement;
      const durationCard = document.getElementById('duration-chart')?.parentElement;
      const volumeCard = document.getElementById('volume-chart')?.parentElement;
      if (freqCard) freqCard.innerHTML = `<h2>Workout Frequency</h2>${emptyMessage}`;
      if (sportCard) sportCard.innerHTML = `<h2>Sport Distribution</h2>${emptyMessage}`;
      if (durationCard) durationCard.innerHTML = `<h2>Average Workout Duration (minutes)</h2>${emptyMessage}`;
      if (volumeCard) volumeCard.innerHTML = `<h2>Total Volume (Sets)</h2>${emptyMessage}`;
      return;
    }
    
    const labels = [];
    const workoutCounts = [];
    
    const sortedStats = stats.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const totalDataPoints = sortedStats.length;
    let skipFactor = 1;
    if (totalDataPoints > 15) skipFactor = Math.ceil(totalDataPoints / 10);
    
    sortedStats.forEach((stat, index) => {
      if (index % skipFactor === 0 || index === totalDataPoints - 1) {
        const date = new Date(stat.date);
        labels.push(`${date.getMonth() + 1}/${date.getDate()}`);
        workoutCounts.push(parseInt(stat.workout_count));
      }
    });
    
    if (charts.frequency) charts.frequency.destroy();
    const freqCtx = document.getElementById('frequency-chart')?.getContext('2d');
    if (freqCtx) {
      charts.frequency = new Chart(freqCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Workouts',
            data: workoutCounts,
            backgroundColor: '#00ff88',
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: '#2a2a2a' },
              ticks: { color: '#b5b5b5', stepSize: 1 }
            },
            x: {
              grid: { color: '#2a2a2a' },
              ticks: { color: '#b5b5b5', maxRotation: 45, minRotation: 0 }
            }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
    
    if (charts.sportDistribution) charts.sportDistribution.destroy();
    const sportCtx = document.getElementById('sport-distribution-chart')?.getContext('2d');
    if (sportCtx && sportDist.length > 0) {
      const sportLabels = sportDist.map(s => s.sport);
      const sportCounts = sportDist.map(s => parseInt(s.workout_count));
      const colors = ['#00ff88', '#00ccff', '#ff6b6b', '#ffd93d', '#a78bfa', '#fb923c', '#22d3ee', '#f472b6'];
      
      charts.sportDistribution = new Chart(sportCtx, {
        type: 'bar',
        data: {
          labels: sportLabels,
          datasets: [{
            label: 'Workouts by Sport',
            data: sportCounts,
            backgroundColor: colors.slice(0, sportLabels.length),
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: '#2a2a2a' },
              ticks: { color: '#b5b5b5', stepSize: 1 }
            },
            x: {
              grid: { color: '#2a2a2a' },
              ticks: { color: '#b5b5b5' }
            }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
    
    if (charts.duration) charts.duration.destroy();
    const durationCtx = document.getElementById('duration-chart')?.getContext('2d');
    if (durationCtx && sportDist.length > 0) {
      const avgDurations = sportDist.map(s => Math.round(parseFloat(s.avg_duration) || 0));
      const colors = ['#00ff88', '#00ccff', '#ff6b6b', '#ffd93d', '#a78bfa', '#fb923c', '#22d3ee', '#f472b6'];
      
      charts.duration = new Chart(durationCtx, {
        type: 'bar',
        data: {
          labels: sportDist.map(s => s.sport),
          datasets: [{
            label: 'Avg Duration (mins)',
            data: avgDurations,
            backgroundColor: colors.slice(0, sportDist.length),
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: '#2a2a2a' },
              ticks: { color: '#b5b5b5' }
            },
            x: {
              grid: { color: '#2a2a2a' },
              ticks: { color: '#b5b5b5' }
            }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
    
    if (charts.volume) charts.volume.destroy();
    const volumeCtx = document.getElementById('volume-chart')?.getContext('2d');
    if (volumeCtx) {
      let filteredWorkouts = userWorkouts;
      const now = new Date();
      
      if (progressPeriod === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filteredWorkouts = userWorkouts.filter(w => new Date(w.date) >= weekAgo);
      } else if (progressPeriod === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        filteredWorkouts = userWorkouts.filter(w => new Date(w.date) >= monthAgo);
      }
      
      const volumeByDate = {};
      filteredWorkouts.forEach(w => {
        const date = new Date(w.date).toLocaleDateString();
        const sets = parseInt(w.sets) || 0;
        volumeByDate[date] = (volumeByDate[date] || 0) + sets;
      });
      
      const volumeEntries = Object.entries(volumeByDate)
        .map(([date, volume]) => ({ date: new Date(date), volume }))
        .sort((a, b) => a.date - b.date);
      
      const volumeLabels = volumeEntries.map(e => `${e.date.getMonth() + 1}/${e.date.getDate()}`);
      const volumeData = volumeEntries.map(e => e.volume);
      
      charts.volume = new Chart(volumeCtx, {
        type: 'bar',
        data: {
          labels: volumeLabels,
          datasets: [{
            label: 'Total Sets',
            data: volumeData,
            backgroundColor: '#00ccff',
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: '#2a2a2a' },
              ticks: { color: '#b5b5b5', stepSize: 1 }
            },
            x: {
              grid: { color: '#2a2a2a' },
              ticks: { color: '#b5b5b5', maxRotation: 45, minRotation: 0 }
            }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
    
    renderPersonalRecords();
  } catch (e) {
    console.error('Failed to load chart data:', e);
  }
}

function renderPersonalRecords() {
  const container = document.getElementById('personal-records');
  if (!container) return;
  
  const records = userWorkouts
    .filter(w => !w.sessionId && w.isPersonalRecord)
    .sort((a, b) => new Date(b.workout_date || b.date) - new Date(a.workout_date || a.date));
  
  if (records.length === 0) {
    container.innerHTML = '<div class="card"><p>No personal records yet. When logging a workout, toggle "New Personal Record" to mark your achievements!</p></div>';
    return;
  }
  
  container.innerHTML = records.map(record => `
    <div class="record-card" onclick="viewRecordDetail(${record.id})" style="cursor: pointer; transition: transform 0.2s;">
      <div class="record-icon">🏆</div>
      <div class="record-info">
        <h3>${record.exercise}</h3>
        <p>${record.date}</p>
      </div>
    </div>
  `).join('');
}

let recordDetailCharts = {
  chart1: null,
  chart2: null
};

async function viewRecordDetail(workoutId) {
  const workout = userWorkouts.find(w => w.id == workoutId);
  if (!workout) return;
  
  navigateTo('record-detail');
  
  document.getElementById('record-detail-title').textContent = workout.exercise;
  document.getElementById('record-detail-date').textContent = `Personal Record Achieved: ${workout.date}`;
  
  const statsHTML = [];
  if (workout.sets && workout.sets !== '-') {
    statsHTML.push(`<div class="workout-stat"><p>Sets</p><p>${workout.sets}</p></div>`);
  }
  if (workout.reps && workout.reps !== '-') {
    statsHTML.push(`<div class="workout-stat"><p>Reps</p><p>${workout.reps}</p></div>`);
  }
  if (workout.distance && workout.distance !== '-') {
    statsHTML.push(`<div class="workout-stat"><p>Distance</p><p>${workout.distance}</p></div>`);
  }
  if (workout.duration && workout.duration !== '-') {
    statsHTML.push(`<div class="workout-stat"><p>Duration</p><p>${workout.duration}</p></div>`);
  }
  
  document.getElementById('record-detail-stats').innerHTML = statsHTML.join('');
  
  if (workout.notes) {
    document.getElementById('record-detail-notes').innerHTML = `
      <div class="workout-notes" style="margin-top: 16px;">
        <p>Notes</p>
        <p>${workout.notes}</p>
      </div>
    `;
  } else {
    document.getElementById('record-detail-notes').innerHTML = '';
  }
  
  await renderRecordCharts(workout);
}

async function renderRecordCharts(workout) {
  const exerciseHistory = userWorkouts
    .filter(w => !w.sessionId && w.exercise === workout.exercise)
    .sort((a, b) => new Date(a.workout_date || a.date) - new Date(b.workout_date || b.date));
  
  if (exerciseHistory.length === 0) return;
  
  if (recordDetailCharts.chart1) recordDetailCharts.chart1.destroy();
  if (recordDetailCharts.chart2) recordDetailCharts.chart2.destroy();
  
  const hasDistance = exerciseHistory.some(w => w.distance && w.distance !== '-');
  const hasDuration = exerciseHistory.some(w => w.duration && w.duration !== '-');
  const hasSets = exerciseHistory.some(w => w.sets && w.sets !== '-');
  const hasReps = exerciseHistory.some(w => w.reps && w.reps !== '-');
  
  const labels = exerciseHistory.map(w => w.date);
  
  if (hasDistance) {
    const distanceData = exerciseHistory.map(w => {
      if (!w.distance || w.distance === '-') return null;
      return parseFloat(w.distance);
    });
    
    document.getElementById('record-chart-1-title').textContent = 'Distance Over Time';
    const ctx1 = document.getElementById('record-chart-1').getContext('2d');
    recordDetailCharts.chart1 = new Chart(ctx1, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Distance',
          data: distanceData,
          borderColor: '#00ff88',
          backgroundColor: 'rgba(0, 255, 136, 0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: '#2a2a2a' },
            ticks: { color: '#b5b5b5' }
          },
          x: {
            grid: { color: '#2a2a2a' },
            ticks: { color: '#b5b5b5' }
          }
        },
        plugins: {
          legend: { labels: { color: '#b5b5b5' } }
        }
      }
    });
  } else if (hasDuration) {
    const durationData = exerciseHistory.map(w => {
      if (!w.duration || w.duration === '-') return null;
      return parseFloat(w.duration);
    });
    
    document.getElementById('record-chart-1-title').textContent = 'Duration Over Time';
    const ctx1 = document.getElementById('record-chart-1').getContext('2d');
    recordDetailCharts.chart1 = new Chart(ctx1, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Duration (min)',
          data: durationData,
          borderColor: '#00ff88',
          backgroundColor: 'rgba(0, 255, 136, 0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: '#2a2a2a' },
            ticks: { color: '#b5b5b5' }
          },
          x: {
            grid: { color: '#2a2a2a' },
            ticks: { color: '#b5b5b5' }
          }
        },
        plugins: {
          legend: { labels: { color: '#b5b5b5' } }
        }
      }
    });
  }
  
  if (hasSets && hasReps) {
    const volumeData = exerciseHistory.map(w => {
      const sets = parseFloat(w.sets) || 0;
      const reps = parseFloat(w.reps) || 0;
      return sets * reps;
    });
    
    document.getElementById('record-chart-2-title').textContent = 'Total Volume (Sets × Reps)';
    const ctx2 = document.getElementById('record-chart-2').getContext('2d');
    recordDetailCharts.chart2 = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Volume',
          data: volumeData,
          backgroundColor: '#00ccff',
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: '#2a2a2a' },
            ticks: { color: '#b5b5b5' }
          },
          x: {
            grid: { color: '#2a2a2a' },
            ticks: { color: '#b5b5b5' }
          }
        },
        plugins: {
          legend: { labels: { color: '#b5b5b5' } }
        }
      }
    });
  } else if (hasSets) {
    const setsData = exerciseHistory.map(w => parseFloat(w.sets) || 0);
    
    document.getElementById('record-chart-2-title').textContent = 'Sets Over Time';
    const ctx2 = document.getElementById('record-chart-2').getContext('2d');
    recordDetailCharts.chart2 = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Sets',
          data: setsData,
          backgroundColor: '#00ccff',
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: '#2a2a2a' },
            ticks: { color: '#b5b5b5', stepSize: 1 }
          },
          x: {
            grid: { color: '#2a2a2a' },
            ticks: { color: '#b5b5b5' }
          }
        },
        plugins: {
          legend: { labels: { color: '#b5b5b5' } }
        }
      }
    });
  }
}

async function renderProfile() {
  if (!currentUser) return;
  
  try {
    const userData = await api.auth.getMe();
    currentUser = userData;
  } catch (e) {
    console.error('Failed to refresh user data:', e);
  }
  
  document.getElementById('profile-name').textContent = currentUser.name || 'Athlete';
  document.getElementById('profile-sport').textContent = 
    currentUser.sports && currentUser.sports.length > 0 
      ? currentUser.sports.join(', ') + ' Athlete' 
      : 'Athlete';
  document.getElementById('profile-bio').textContent = currentUser.bio || '';
  document.getElementById('profile-avatar').src = 
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.name}`;
  document.getElementById('goal-display').textContent = currentUser.weeklyGoal || 5;
  document.getElementById('weekly-goal-slider').value = currentUser.weeklyGoal || 5;
  
  setSelectedSports(currentUser.sports || []);
  
  const recentWorkouts = userWorkouts.slice(0, 3);
  const recentContainer = document.getElementById('profile-recent-workouts');
  if (recentContainer) {
    if (recentWorkouts.length === 0) {
      recentContainer.innerHTML = '<p>No recent workouts</p>';
    } else {
      recentContainer.innerHTML = recentWorkouts.map(w => `
        <div class="feed-item">
          <div class="feed-content">
            <h4>${w.exercise}</h4>
            <p>${w.sport} • ${w.date}</p>
          </div>
        </div>
      `).join('');
    }
  }
}

function switchProfileTab(tab) {
  const tabs = document.querySelectorAll('.profile-tabs .tab-btn');
  tabs.forEach(t => t.classList.remove('active'));
  
  if (tab === 'info') {
    tabs[0].classList.add('active');
    document.getElementById('profile-info-tab').classList.add('active');
    document.getElementById('profile-settings-tab').classList.remove('active');
  } else {
    tabs[1].classList.add('active');
    document.getElementById('profile-info-tab').classList.remove('active');
    document.getElementById('profile-settings-tab').classList.add('active');
  }
}

async function toggleEditMode() {
  isEditMode = !isEditMode;
  
  document.getElementById('edit-btn-text').textContent = 
    isEditMode ? '💾 Save Profile' : '✏️ Edit Profile';
  
  const bioElement = document.getElementById('profile-bio');
  const nameElement = document.getElementById('profile-name');
  const sportElement = document.getElementById('profile-sport');
  const sportSelectorContainer = document.getElementById('profile-sport-selector-container');
  const slider = document.getElementById('weekly-goal-slider');
  const sportsContainer = document.getElementById('sports-selector-container');
  
  if (isEditMode) {
    bioElement.contentEditable = true;
    bioElement.style.border = '1px solid #00ff88';
    bioElement.style.padding = '8px';
    bioElement.style.borderRadius = '4px';
    
    nameElement.contentEditable = true;
    nameElement.style.border = '1px solid #00ff88';
    nameElement.style.padding = '4px';
    nameElement.style.borderRadius = '4px';
    
    sportElement.style.display = 'none';
    sportSelectorContainer.style.display = 'block';
    renderProfileSportsCheckboxes();
    
    slider.disabled = false;
    sportsContainer.style.display = 'block';
    
    slider.oninput = function() {
      document.getElementById('goal-display').textContent = this.value;
    };
  } else {
    bioElement.contentEditable = false;
    bioElement.style.border = 'none';
    bioElement.style.padding = '0';
    
    nameElement.contentEditable = false;
    nameElement.style.border = 'none';
    nameElement.style.padding = '0';
    
    sportElement.style.display = 'block';
    sportSelectorContainer.style.display = 'none';
    
    slider.disabled = true;
    sportsContainer.style.display = 'none';
    
    saveProfile();
  }
}

function renderProfileSportsCheckboxes() {
  const container = document.getElementById('profile-sports-checkboxes');
  if (!container) return;
  
  container.innerHTML = availableSports.map(sport => {
    const isSelected = currentUser?.sports?.includes(sport.name) || false;
    return `
      <label class="sport-checkbox">
        <input type="checkbox" value="${sport.name}" ${isSelected ? 'checked' : ''}>
        <span>${sport.name}</span>
      </label>
    `;
  }).join('');
}

function getProfileSelectedSports() {
  const checkboxes = document.querySelectorAll('#profile-sports-checkboxes input[type="checkbox"]:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

async function saveProfile() {
  const name = document.getElementById('profile-name').textContent;
  const bio = document.getElementById('profile-bio').textContent;
  const weeklyGoal = parseInt(document.getElementById('weekly-goal-slider').value);
  const sports = getProfileSelectedSports();
  
  if (sports.length === 0) {
    alert('Please select at least one sport interest');
    toggleEditMode();
    return;
  }
  
  try {
    await api.profile.update({ name, bio, weeklyGoal, sports });
    currentUser.name = name;
    currentUser.bio = bio;
    currentUser.weeklyGoal = weeklyGoal;
    currentUser.sports = sports;
    
    document.getElementById('profile-sport').textContent = sports.join(', ') + ' Athlete';
    
    await loadActivityFeed();
  } catch (e) {
    alert('Failed to update profile: ' + e.message);
  }
}

function updateWeeklyProgress() {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  weekAgo.setHours(0, 0, 0, 0);
  
  const workoutsThisWeek = userWorkouts.filter(w => {
    const workoutDate = new Date(w.date);
    return workoutDate >= weekAgo;
  });
  
  const uniqueDays = new Set(workoutsThisWeek.map(w => {
    const date = new Date(w.date);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  })).size;
  
  const goal = currentUser?.weeklyGoal || 5;
  const percentage = Math.round((uniqueDays / goal) * 100);
  
  const label = document.getElementById('weekly-progress-label');
  const progress = document.getElementById('weekly-progress');
  const percentageLabel = document.getElementById('weekly-progress-percentage');
  const percentageBar = document.getElementById('weekly-progress-percentage-bar');
  
  if (label) label.textContent = `${uniqueDays}/${goal}`;
  if (progress) progress.style.width = `${Math.min(percentage, 100)}%`;
  if (percentageLabel) percentageLabel.textContent = `${Math.min(percentage, 100)}%`;
  if (percentageBar) percentageBar.style.width = `${Math.min(percentage, 100)}%`;
}

function openEditGoal() {
  const currentGoal = currentUser?.weeklyGoal || 5;
  const newGoal = prompt(`Enter your new weekly workout goal (1-7):`, currentGoal);
  
  if (newGoal === null) return;
  
  const goalNumber = parseInt(newGoal);
  if (isNaN(goalNumber) || goalNumber < 1 || goalNumber > 7) {
    alert('Please enter a number between 1 and 7');
    return;
  }
  
  updateWeeklyGoal(goalNumber);
}

async function updateWeeklyGoal(newGoal) {
  try {
    await api.profile.update({ weeklyGoal: newGoal });
    currentUser.weeklyGoal = newGoal;
    updateWeeklyProgress();
    alert(`Weekly goal updated to ${newGoal} workout${newGoal > 1 ? 's' : ''} per week!`);
  } catch (e) {
    alert('Failed to update weekly goal: ' + e.message);
  }
}

let allAthletes = [];

async function filterAthletes() {
  const searchQuery = document.getElementById('athlete-search')?.value || '';
  
  try {
    allAthletes = await api.users.search(searchQuery);
    renderAthletes();
  } catch (e) {
    console.error('Failed to search athletes:', e);
  }
}

function renderAthletes() {
  const recommendedContainer = document.getElementById('recommended-athletes');
  const otherContainer = document.getElementById('other-athletes');
  
  if (!recommendedContainer || !otherContainer) return;
  
  if (allAthletes.length === 0) {
    recommendedContainer.innerHTML = '<p style="text-align: center; color: #b5b5b5;">No athletes found</p>';
    otherContainer.innerHTML = '';
    return;
  }
  
  const athleteHTML = (athlete) => `
    <div class="athlete-card">
      <div class="athlete-header">
        <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${athlete.name}" 
             class="athlete-avatar" alt="${athlete.name}">
        <div class="athlete-info">
          <h3>${athlete.name}</h3>
          <div class="athlete-sport">
            <span>⚡</span>
            <span>${athlete.sports.length > 0 ? athlete.sports.join(', ') : 'Athlete'}</span>
          </div>
        </div>
      </div>
      ${athlete.bio ? `<p class="athlete-bio">${athlete.bio}</p>` : ''}
      <div class="athlete-stats">
        <div class="athlete-stat">
          <p>Workouts</p>
          <p>${athlete.workoutsCount}</p>
        </div>
        <div class="athlete-stat">
          <p>Followers</p>
          <p>${athlete.followersCount}</p>
        </div>
      </div>
      <button class="btn-${athlete.isFollowing ? 'secondary' : 'primary'} full-width" 
              onclick="toggleFollow(${athlete.id})">
        ${athlete.isFollowing ? '✓ Following' : '+ Follow'}
      </button>
    </div>
  `;
  
  const userSports = currentUser?.sports || [];
  
  const recommendedAthletes = allAthletes.filter(athlete => {
    return athlete.sports.some(sport => userSports.includes(sport));
  });
  
  const otherAthletes = allAthletes.filter(athlete => {
    return !athlete.sports.some(sport => userSports.includes(sport));
  });
  
  if (recommendedAthletes.length === 0) {
    recommendedContainer.innerHTML = '<p style="text-align: center; color: #b5b5b5;">No athletes with matching sports found</p>';
  } else {
    recommendedContainer.innerHTML = recommendedAthletes.map(athleteHTML).join('');
  }
  
  if (otherAthletes.length === 0) {
    otherContainer.innerHTML = '<p style="text-align: center; color: #b5b5b5;">No other athletes found</p>';
  } else {
    otherContainer.innerHTML = otherAthletes.map(athleteHTML).join('');
  }
}

async function toggleFollow(userId) {
  try {
    const result = await api.users.follow(userId);
    const athlete = allAthletes.find(a => a.id === userId);
    if (athlete) {
      athlete.isFollowing = result.following;
      if (result.following) {
        athlete.followersCount++;
      } else {
        athlete.followersCount--;
      }
      renderAthletes();
    }
  } catch (e) {
    console.error('Failed to toggle follow:', e);
    alert('Failed to follow/unfollow user');
  }
}

document.addEventListener('DOMContentLoaded', initializeApp);
