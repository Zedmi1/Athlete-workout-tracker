let currentUser = null;
let sessionId = localStorage.getItem('sessionId');
let availableSports = [];
let activityFeed = [];
let userWorkouts = [];
let isEditMode = false;
let progressPeriod = 'month';
let charts = {};

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
    mine: () => request('/api/workouts/mine'),
    feed: () => request('/api/workouts/feed'),
    like: (id) => request(`/api/workouts/${id}/like`, { method: 'POST' }),
    stats: (period) => request(`/api/workouts/stats?period=${period}`),
    sportDistribution: (period) => request(`/api/workouts/sport-distribution?period=${period}`),
    delete: (id) => request(`/api/workouts/${id}`, { method: 'DELETE' })
  },
  profile: {
    update: (data) => request('/api/user/profile', { method: 'PUT', body: JSON.stringify(data) })
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
  document.getElementById('auth-submit-btn').textContent = isLoginMode ? 'Login' : 'Register';
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
      
      result = await api.auth.register({ name, email, password, sports });
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
  
  activityFeed.forEach(item => {
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
      </div>
      <div class="feed-actions">
        <button class="like-btn ${item.liked ? 'liked' : ''}" onclick="toggleLike('${item.id}', 'feed')">
          ${item.liked ? '❤️' : '🤍'} ${item.likes}
        </button>
      </div>
    `;
    feedContainer.appendChild(feedItem);
  });
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
  
  form.style.display = isVisible ? 'none' : 'block';
  document.getElementById('form-toggle-text').textContent = isVisible ? '+ Log Workout' : 'Cancel';
}

async function saveWorkout(event) {
  event.preventDefault();
  
  const exercise = document.getElementById('exercise-name').value;
  const sport = document.getElementById('workout-sport').value;
  const sets = document.getElementById('workout-sets').value || null;
  const reps = document.getElementById('workout-reps').value || null;
  const distance = document.getElementById('workout-distance').value || null;
  const duration = document.getElementById('workout-duration').value || null;
  const notes = document.getElementById('workout-notes').value || null;
  
  try {
    const newWorkout = await api.workouts.create({
      exercise, sport, sets, reps, distance, duration, notes
    });
    
    userWorkouts.unshift(newWorkout);
    
    event.target.reset();
    toggleWorkoutForm();
    renderWorkouts();
    
    await loadActivityFeed();
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
  
  userWorkouts.forEach(workout => {
    const workoutItem = document.createElement('div');
    workoutItem.className = 'workout-item';
    
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
    
    workoutItem.innerHTML = `
      <div class="workout-header">
        <div class="workout-title-section">
          <div class="workout-title-row">
            <h3>${workout.exercise}</h3>
            <span class="sport-badge">${workout.sport}</span>
          </div>
          <div class="workout-meta">
            <span>📅 ${workout.date}</span>
            <span>🕐 ${workout.time}</span>
          </div>
        </div>
      </div>
      <div class="workout-stats">
        ${statsHTML.join('')}
      </div>
      ${workout.notes ? `
        <div class="workout-notes">
          <p>Notes</p>
          <p>${workout.notes}</p>
        </div>
      ` : ''}
      <div class="feed-actions">
        <button class="like-btn ${workout.liked ? 'liked' : ''}" onclick="toggleLike('${workout.id}', 'workout')">
          ${workout.liked ? '❤️' : '🤍'} ${workout.likes}
        </button>
        <button class="delete-btn" onclick="deleteWorkout('${workout.id}')" title="Delete workout">
          🗑️ Delete
        </button>
      </div>
    `;
    
    container.appendChild(workoutItem);
  });
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
      if (freqCard) freqCard.innerHTML = `<h2>Workout Frequency</h2>${emptyMessage}`;
      if (sportCard) sportCard.innerHTML = `<h2>Sport Distribution</h2>${emptyMessage}`;
      if (durationCard) durationCard.innerHTML = `<h2>Average Workout Duration</h2>${emptyMessage}`;
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
          indexAxis: 'y',
          scales: {
            x: {
              beginAtZero: true,
              grid: { color: '#2a2a2a' },
              ticks: { color: '#b5b5b5', stepSize: 1 }
            },
            y: {
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
        type: 'line',
        data: {
          labels: sportDist.map(s => s.sport),
          datasets: [{
            label: 'Avg Duration (mins)',
            data: avgDurations,
            borderColor: '#00ccff',
            backgroundColor: 'rgba(0, 204, 255, 0.1)',
            borderWidth: 3,
            pointRadius: 8,
            pointBackgroundColor: colors.slice(0, sportDist.length),
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
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
    .filter(w => w.distance && w.distance !== '-')
    .sort((a, b) => {
      const aVal = parseFloat(a.distance);
      const bVal = parseFloat(b.distance);
      return bVal - aVal;
    })
    .slice(0, 4);
  
  if (records.length === 0) {
    container.innerHTML = '<div class="card"><p>No personal records yet. Keep training!</p></div>';
    return;
  }
  
  container.innerHTML = records.map(record => `
    <div class="record-card">
      <div class="record-icon">🏆</div>
      <div class="record-info">
        <h3>${record.exercise}</h3>
        <p>${record.distance} • ${record.date}</p>
      </div>
    </div>
  `).join('');
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
  
  const recentWorkouts = userWorkouts.slice(0, 5);
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
  const slider = document.getElementById('weekly-goal-slider');
  const sportsContainer = document.getElementById('sports-selector-container');
  const exercisesContainer = document.getElementById('exercises-list-container');
  
  if (isEditMode) {
    bioElement.contentEditable = true;
    bioElement.style.border = '1px solid #00ff88';
    bioElement.style.padding = '8px';
    bioElement.style.borderRadius = '4px';
    
    nameElement.contentEditable = true;
    nameElement.style.border = '1px solid #00ff88';
    nameElement.style.padding = '4px';
    nameElement.style.borderRadius = '4px';
    
    slider.disabled = false;
    sportsContainer.style.display = 'block';
    exercisesContainer.style.display = 'block';
    
    await renderExercisesList();
    
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
    
    slider.disabled = true;
    sportsContainer.style.display = 'none';
    exercisesContainer.style.display = 'none';
    
    saveProfile();
  }
}

async function renderExercisesList() {
  try {
    const exercises = await api.exercises.list();
    const container = document.getElementById('exercises-list');
    
    let html = '';
    for (const [sport, exerciseList] of Object.entries(exercises)) {
      html += `
        <div class="exercise-sport-section">
          <h4>${sport}</h4>
          <ul class="exercise-list">
            ${exerciseList.map(ex => `<li>${ex}</li>`).join('')}
          </ul>
        </div>
      `;
    }
    
    container.innerHTML = html;
  } catch (e) {
    console.error('Failed to load exercises:', e);
  }
}

async function saveProfile() {
  const name = document.getElementById('profile-name').textContent;
  const bio = document.getElementById('profile-bio').textContent;
  const weeklyGoal = parseInt(document.getElementById('weekly-goal-slider').value);
  const sports = getSelectedSports();
  
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
  const currentWeek = userWorkouts.filter(w => {
    const workoutDate = new Date(w.date);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return workoutDate >= weekAgo;
  }).length;
  
  const goal = currentUser?.weeklyGoal || 5;
  const percentage = Math.round((currentWeek / goal) * 100);
  
  const label = document.getElementById('weekly-progress-label');
  const progress = document.getElementById('weekly-progress');
  
  if (label) label.textContent = `${currentWeek}/${goal}`;
  if (progress) progress.style.width = `${Math.min(percentage, 100)}%`;
}

function filterAthletes() {
  console.log('Athlete filtering not implemented with database yet');
}

function renderAthletes() {
  console.log('Athlete rendering not implemented with database yet');
}

document.addEventListener('DOMContentLoaded', initializeApp);
