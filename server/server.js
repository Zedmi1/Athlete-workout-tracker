require("dotenv").config({ override: true });
const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const db = require("./db");

const app = express();
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

const sessions = new Map();

function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password, sports } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const existingUser = await db.query(
      "SELECT id FROM users WHERE email = $1",
      [email],
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userResult = await db.query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, bio, weekly_goal",
      [name, email, passwordHash],
    );

    const user = userResult.rows[0];

    if (sports && sports.length > 0) {
      for (const sportName of sports) {
        const sportResult = await db.query(
          "SELECT id FROM sports WHERE name = $1",
          [sportName],
        );
        if (sportResult.rows.length > 0) {
          await db.query(
            "INSERT INTO user_sports (user_id, sport_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [user.id, sportResult.rows[0].id],
          );
        }
      }
    }

    const sessionId = generateSessionId();
    sessions.set(sessionId, user.id);

    res.json({
      success: true,
      sessionId,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        bio: user.bio,
        weeklyGoal: user.weekly_goal,
        sports: sports || [],
      },
    });
  } catch (e) {
    console.error("Register error:", e);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  try {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const userSportsResult = await db.query(
      "SELECT s.name FROM sports s JOIN user_sports us ON s.id = us.sport_id WHERE us.user_id = $1",
      [user.id],
    );
    const sports = userSportsResult.rows.map((r) => r.name);

    const sessionId = generateSessionId();
    sessions.set(sessionId, user.id);

    res.json({
      success: true,
      sessionId,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        bio: user.bio,
        weeklyGoal: user.weekly_goal,
        sports: sports,
      },
    });
  } catch (e) {
    console.error("Login error:", e);
    res.status(500).json({ error: "Login failed" });
  }
});

app.get("/api/auth/me", async (req, res) => {
  const sessionId = req.headers["x-session-id"];
  const userId = sessions.get(sessionId);

  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const userResult = await db.query(
      "SELECT id, name, email, bio, weekly_goal FROM users WHERE id = $1",
      [userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];
    const sportsResult = await db.query(
      "SELECT s.name FROM sports s JOIN user_sports us ON s.id = us.sport_id WHERE us.user_id = $1",
      [userId],
    );

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      bio: user.bio,
      weeklyGoal: user.weekly_goal,
      sports: sportsResult.rows.map((r) => r.name),
    });
  } catch (e) {
    console.error("Get user error:", e);
    res.status(500).json({ error: "Failed to get user" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  const sessionId = req.headers["x-session-id"];
  sessions.delete(sessionId);
  res.json({ success: true });
});

app.get("/api/sports", async (req, res) => {
  try {
    const result = await db.query("SELECT id, name FROM sports ORDER BY name");
    res.json(result.rows);
  } catch (e) {
    console.error("Get sports error:", e);
    res.status(500).json({ error: "Failed to get sports" });
  }
});

app.get("/api/exercises", async (req, res) => {
  const exercisesBySport = {
    Football: [
      "Sprint Drills",
      "Ball Control Training",
      "Tactical Session",
      "Shooting Practice",
      "Passing Drills",
    ],
    Basketball: [
      "Free Throw Practice",
      "Defensive Drills",
      "Scrimmage Game",
      "Dribbling Drills",
      "Layup Practice",
    ],
    Athletics: [
      "Track Intervals",
      "Long Distance Run",
      "Hill Sprints",
      "Speed Work",
      "Endurance Training",
    ],
    Swimming: [
      "Freestyle Intervals",
      "Endurance Session",
      "Mixed Stroke Practice",
      "Butterfly Drills",
      "Backstroke Training",
    ],
    Cycling: [
      "Hill Climbing",
      "Interval Training",
      "Long Ride",
      "Sprint Training",
      "Time Trial",
    ],
    Tennis: [
      "Serve Practice",
      "Match Play",
      "Footwork Drills",
      "Backhand Training",
      "Volley Practice",
    ],
    Volleyball: [
      "Spike Training",
      "Team Practice",
      "Blocking Technique",
      "Serving Drills",
      "Passing Practice",
    ],
    Golf: [
      "Driving Range",
      "Putting Practice",
      "18 Holes",
      "Chipping Practice",
      "Iron Training",
    ],
  };
  res.json(exercisesBySport);
});

app.put("/api/user/profile", async (req, res) => {
  const sessionId = req.headers["x-session-id"];
  const userId = sessions.get(sessionId);

  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { name, bio, weeklyGoal, sports } = req.body;

  try {
    if (name || bio || weeklyGoal !== undefined) {
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (name) {
        updates.push(`name = $${paramCount++}`);
        values.push(name);
      }
      if (bio !== undefined) {
        updates.push(`bio = $${paramCount++}`);
        values.push(bio);
      }
      if (weeklyGoal !== undefined) {
        updates.push(`weekly_goal = $${paramCount++}`);
        values.push(weeklyGoal);
      }

      values.push(userId);
      await db.query(
        `UPDATE users SET ${updates.join(", ")} WHERE id = $${paramCount}`,
        values,
      );
    }

    if (sports !== undefined) {
      await db.query("DELETE FROM user_sports WHERE user_id = $1", [userId]);

      for (const sportName of sports) {
        const sportResult = await db.query(
          "SELECT id FROM sports WHERE name = $1",
          [sportName],
        );
        if (sportResult.rows.length > 0) {
          await db.query(
            "INSERT INTO user_sports (user_id, sport_id) VALUES ($1, $2)",
            [userId, sportResult.rows[0].id],
          );
        }
      }
    }

    res.json({ success: true });
  } catch (e) {
    console.error("Update profile error:", e);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

app.post("/api/workouts", async (req, res) => {
  const sessionId = req.headers["x-session-id"];
  const userId = sessions.get(sessionId);

  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { exercise, sport, sets, reps, distance, duration, notes, workoutDate } = req.body;

  if (!exercise || !sport) {
    return res.status(400).json({ error: "Exercise and sport are required" });
  }

  try {
    const sportResult = await db.query(
      "SELECT id FROM sports WHERE name = $1",
      [sport],
    );
    const sportId = sportResult.rows.length > 0 ? sportResult.rows[0].id : null;

    const workoutTimestamp = workoutDate ? new Date(workoutDate) : new Date();

    const result = await db.query(
      `INSERT INTO workouts (user_id, exercise, sport_id, sets, reps, distance, duration, notes, workout_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, exercise, sets, reps, distance, duration, notes, workout_date`,
      [
        userId,
        exercise,
        sportId,
        sets || null,
        reps || null,
        distance || null,
        duration || null,
        notes || null,
        workoutTimestamp,
      ],
    );

    const workout = result.rows[0];
    res.status(201).json({
      id: workout.id,
      exercise: workout.exercise,
      sport,
      sets: workout.sets,
      reps: workout.reps,
      distance: workout.distance,
      duration: workout.duration,
      notes: workout.notes,
      date: new Date(workout.workout_date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      time: new Date(workout.workout_date).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      likes: 0,
      liked: false,
    });
  } catch (e) {
    console.error("Create workout error:", e);
    res.status(500).json({ error: "Failed to create workout" });
  }
});

app.put("/api/workouts/:id", async (req, res) => {
  const sessionId = req.headers["x-session-id"];
  const userId = sessions.get(sessionId);

  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const workoutId = req.params.id;
  const { exercise, sport, sets, reps, distance, duration, notes, workoutDate } = req.body;

  if (!exercise || !sport) {
    return res.status(400).json({ error: "Exercise and sport are required" });
  }

  try {
    const checkOwnership = await db.query(
      "SELECT user_id FROM workouts WHERE id = $1",
      [workoutId],
    );

    if (checkOwnership.rows.length === 0) {
      return res.status(404).json({ error: "Workout not found" });
    }

    if (checkOwnership.rows[0].user_id !== userId) {
      return res
        .status(403)
        .json({ error: "Not authorized to update this workout" });
    }

    const sportResult = await db.query(
      "SELECT id FROM sports WHERE name = $1",
      [sport],
    );
    const sportId = sportResult.rows.length > 0 ? sportResult.rows[0].id : null;

    const workoutTimestamp = workoutDate ? new Date(workoutDate) : null;
    
    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;
    
    updateFields.push(`exercise = $${paramCount++}`);
    updateValues.push(exercise);
    
    updateFields.push(`sport_id = $${paramCount++}`);
    updateValues.push(sportId);
    
    updateFields.push(`sets = $${paramCount++}`);
    updateValues.push(sets || null);
    
    updateFields.push(`reps = $${paramCount++}`);
    updateValues.push(reps || null);
    
    updateFields.push(`distance = $${paramCount++}`);
    updateValues.push(distance || null);
    
    updateFields.push(`duration = $${paramCount++}`);
    updateValues.push(duration || null);
    
    updateFields.push(`notes = $${paramCount++}`);
    updateValues.push(notes || null);
    
    if (workoutTimestamp) {
      updateFields.push(`workout_date = $${paramCount++}`);
      updateValues.push(workoutTimestamp);
    }
    
    updateValues.push(workoutId);

    const result = await db.query(
      `UPDATE workouts 
       SET ${updateFields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING id, exercise, sets, reps, distance, duration, notes, workout_date`,
      updateValues,
    );

    const workout = result.rows[0];
    res.json({
      id: workout.id,
      exercise: workout.exercise,
      sport,
      sets: workout.sets,
      reps: workout.reps,
      distance: workout.distance,
      duration: workout.duration,
      notes: workout.notes,
      date: new Date(workout.workout_date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      time: new Date(workout.workout_date).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      likes: 0,
      liked: false,
    });
  } catch (e) {
    console.error("Update workout error:", e);
    res.status(500).json({ error: "Failed to update workout" });
  }
});

app.delete("/api/workouts/:id", async (req, res) => {
  const sessionId = req.headers["x-session-id"];
  const userId = sessions.get(sessionId);

  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const workoutId = req.params.id;

  try {
    const checkOwnership = await db.query(
      "SELECT user_id FROM workouts WHERE id = $1",
      [workoutId],
    );

    if (checkOwnership.rows.length === 0) {
      return res.status(404).json({ error: "Workout not found" });
    }

    if (checkOwnership.rows[0].user_id !== userId) {
      return res
        .status(403)
        .json({ error: "Not authorized to delete this workout" });
    }

    await db.query("DELETE FROM workouts WHERE id = $1", [workoutId]);
    res.json({ success: true });
  } catch (e) {
    console.error("Delete workout error:", e);
    res.status(500).json({ error: "Failed to delete workout" });
  }
});

app.get("/api/workouts/mine", async (req, res) => {
  const sessionId = req.headers["x-session-id"];
  const userId = sessions.get(sessionId);

  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const result = await db.query(
      `SELECT w.id, w.exercise, s.name as sport, w.sets, w.reps, w.distance, w.duration, 
              w.notes, w.likes, w.workout_date,
              (SELECT COUNT(*) FROM workout_likes WHERE workout_id = w.id AND user_id = $1) as user_liked
       FROM workouts w
       LEFT JOIN sports s ON w.sport_id = s.id
       WHERE w.user_id = $1
       ORDER BY w.workout_date DESC`,
      [userId],
    );

    const workouts = result.rows.map((w) => ({
      id: w.id,
      exercise: w.exercise,
      sport: w.sport,
      sets: w.sets || "-",
      reps: w.reps || "-",
      distance: w.distance || "-",
      duration: w.duration || "-",
      notes: w.notes,
      date: new Date(w.workout_date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      time: new Date(w.workout_date).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      likes: w.likes,
      liked: w.user_liked > 0,
    }));

    res.json(workouts);
  } catch (e) {
    console.error("Get workouts error:", e);
    res.status(500).json({ error: "Failed to get workouts" });
  }
});

app.get("/api/workouts/feed", async (req, res) => {
  const sessionId = req.headers["x-session-id"];
  const userId = sessions.get(sessionId);

  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const userSportsResult = await db.query(
      "SELECT sport_id FROM user_sports WHERE user_id = $1",
      [userId],
    );
    const sportIds = userSportsResult.rows.map((r) => r.sport_id);

    let query;
    let params;

    if (sportIds.length === 0) {
      query = `
        SELECT w.id, u.name as author, s.name as sport, w.exercise, 
               w.sets, w.reps, w.distance, w.duration, w.notes, w.likes, w.workout_date,
               (SELECT COUNT(*) FROM workout_likes WHERE workout_id = w.id AND user_id = $1) as user_liked
        FROM workouts w
        JOIN users u ON w.user_id = u.id
        LEFT JOIN sports s ON w.sport_id = s.id
        ORDER BY w.workout_date DESC
        LIMIT 50
      `;
      params = [userId];
    } else {
      query = `
        SELECT w.id, u.name as author, s.name as sport, w.exercise,
               w.sets, w.reps, w.distance, w.duration, w.notes, w.likes, w.workout_date,
               (SELECT COUNT(*) FROM workout_likes WHERE workout_id = w.id AND user_id = $1) as user_liked
        FROM workouts w
        JOIN users u ON w.user_id = u.id
        LEFT JOIN sports s ON w.sport_id = s.id
        WHERE w.sport_id = ANY($2::int[])
        ORDER BY w.workout_date DESC
        LIMIT 50
      `;
      params = [userId, sportIds];
    }

    const result = await db.query(query, params);

    const feed = result.rows.map((w) => {
      const stats = [];
      if (w.sets) stats.push(`${w.sets} sets`);
      if (w.reps) stats.push(`${w.reps} reps`);
      if (w.distance) stats.push(w.distance);
      if (w.duration) stats.push(w.duration);

      const now = new Date();
      const createdAt = new Date(w.workout_date);
      const diffMs = now - createdAt;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      let timeAgo;
      if (diffMins < 60) {
        timeAgo = diffMins <= 1 ? "Just now" : `${diffMins} minutes ago`;
      } else if (diffHours < 24) {
        timeAgo = diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
      } else {
        timeAgo = diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
      }

      return {
        id: w.id,
        author: w.author,
        sport: w.sport,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${w.author}`,
        workout: w.exercise,
        stats: stats.join(" • ") || "No stats",
        notes: w.notes || '',
        time: timeAgo,
        likes: w.likes,
        liked: w.user_liked > 0,
      };
    });

    res.json(feed);
  } catch (e) {
    console.error("Get feed error:", e);
    res.status(500).json({ error: "Failed to get feed" });
  }
});

app.post("/api/workouts/:id/like", async (req, res) => {
  const sessionId = req.headers["x-session-id"];
  const userId = sessions.get(sessionId);

  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const workoutId = req.params.id;

  try {
    const existingLike = await db.query(
      "SELECT * FROM workout_likes WHERE user_id = $1 AND workout_id = $2",
      [userId, workoutId],
    );

    if (existingLike.rows.length > 0) {
      await db.query(
        "DELETE FROM workout_likes WHERE user_id = $1 AND workout_id = $2",
        [userId, workoutId],
      );
      await db.query("UPDATE workouts SET likes = likes - 1 WHERE id = $1", [
        workoutId,
      ]);
      res.json({ liked: false });
    } else {
      await db.query(
        "INSERT INTO workout_likes (user_id, workout_id) VALUES ($1, $2)",
        [userId, workoutId],
      );
      await db.query("UPDATE workouts SET likes = likes + 1 WHERE id = $1", [
        workoutId,
      ]);
      res.json({ liked: true });
    }
  } catch (e) {
    console.error("Like workout error:", e);
    res.status(500).json({ error: "Failed to like workout" });
  }
});

app.get("/api/workouts/stats", async (req, res) => {
  const sessionId = req.headers["x-session-id"];
  const userId = sessions.get(sessionId);

  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { period } = req.query;

  try {
    let dateFilter = "";
    if (period === "week") {
      dateFilter = "AND workout_date >= NOW() - INTERVAL '7 days'";
    } else if (period === "month") {
      dateFilter = "AND workout_date >= NOW() - INTERVAL '30 days'";
    }

    const result = await db.query(
      `SELECT 
        DATE(workout_date) as date,
        COUNT(*) as workout_count,
        SUM(CASE 
          WHEN duration ~ '^[0-9]+ min$' THEN CAST(REGEXP_REPLACE(duration, '[^0-9]', '', 'g') AS INTEGER)
          WHEN duration ~ '^[0-9]+:[0-9]+' THEN 
            CAST(SPLIT_PART(duration, ':', 1) AS INTEGER) * 60 + 
            CAST(SPLIT_PART(duration, ':', 2) AS INTEGER)
          ELSE 0
        END) as total_duration
       FROM workouts
       WHERE user_id = $1 ${dateFilter}
       GROUP BY DATE(workout_date)
       ORDER BY date DESC`,
      [userId],
    );

    res.json(result.rows);
  } catch (e) {
    console.error("Get stats error:", e);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

app.get("/api/workouts/sport-distribution", async (req, res) => {
  const sessionId = req.headers["x-session-id"];
  const userId = sessions.get(sessionId);

  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { period } = req.query;

  try {
    let dateFilter = "";
    if (period === "week") {
      dateFilter = "AND w.workout_date >= NOW() - INTERVAL '7 days'";
    } else if (period === "month") {
      dateFilter = "AND w.workout_date >= NOW() - INTERVAL '30 days'";
    }

    const result = await db.query(
      `SELECT 
        s.name as sport,
        COUNT(*) as workout_count,
        AVG(CASE 
          WHEN w.duration ~ '^[0-9]+ min$' THEN CAST(REGEXP_REPLACE(w.duration, '[^0-9]', '', 'g') AS INTEGER)
          WHEN w.duration ~ '^[0-9]+:[0-9]+' THEN 
            CAST(SPLIT_PART(w.duration, ':', 1) AS INTEGER) * 60 + 
            CAST(SPLIT_PART(w.duration, ':', 2) AS INTEGER)
          ELSE 0
        END) as avg_duration
       FROM workouts w
       LEFT JOIN sports s ON w.sport_id = s.id
       WHERE w.user_id = $1 ${dateFilter}
       GROUP BY s.name
       ORDER BY workout_count DESC`,
      [userId],
    );

    res.json(result.rows);
  } catch (e) {
    console.error("Get sport distribution error:", e);
    res.status(500).json({ error: "Failed to get sport distribution" });
  }
});

app.get("/api/users/search", async (req, res) => {
  const sessionId = req.headers["x-session-id"];
  const userId = sessions.get(sessionId);

  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { query } = req.query;

  try {
    let searchQuery = `
      SELECT u.id, u.name, u.bio,
        (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count,
        (SELECT COUNT(*) FROM workouts WHERE user_id = u.id) as workouts_count,
        (SELECT COUNT(*) FROM follows WHERE follower_id = $1 AND following_id = u.id) as is_following
      FROM users u
      WHERE u.id != $1
    `;
    const params = [userId];

    if (query) {
      searchQuery += ` AND LOWER(u.name) LIKE LOWER($2)`;
      params.push(`%${query}%`);
    }

    searchQuery += ` ORDER BY u.name LIMIT 50`;

    const result = await db.query(searchQuery, params);

    const users = await Promise.all(
      result.rows.map(async (user) => {
        const sportsResult = await db.query(
          "SELECT s.name FROM sports s JOIN user_sports us ON s.id = us.sport_id WHERE us.user_id = $1",
          [user.id],
        );

        return {
          id: user.id,
          name: user.name,
          bio: user.bio || "",
          sports: sportsResult.rows.map((r) => r.name),
          followersCount: parseInt(user.followers_count),
          workoutsCount: parseInt(user.workouts_count),
          isFollowing: user.is_following > 0,
        };
      }),
    );

    res.json(users);
  } catch (e) {
    console.error("Search users error:", e);
    res.status(500).json({ error: "Failed to search users" });
  }
});

app.post("/api/users/:id/follow", async (req, res) => {
  const sessionId = req.headers["x-session-id"];
  const userId = sessions.get(sessionId);

  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const targetUserId = parseInt(req.params.id);

  if (targetUserId === userId) {
    return res.status(400).json({ error: "Cannot follow yourself" });
  }

  try {
    const checkFollow = await db.query(
      "SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2",
      [userId, targetUserId],
    );

    if (checkFollow.rows.length > 0) {
      await db.query(
        "DELETE FROM follows WHERE follower_id = $1 AND following_id = $2",
        [userId, targetUserId],
      );
      res.json({ success: true, following: false });
    } else {
      await db.query(
        "INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)",
        [userId, targetUserId],
      );
      res.json({ success: true, following: true });
    }
  } catch (e) {
    console.error("Follow user error:", e);
    res.status(500).json({ error: "Failed to follow/unfollow user" });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function initializeDatabase() {
  try {
    const checkTable = await db.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'sports')",
    );

    if (!checkTable.rows[0].exists) {
      console.log("Sports table not found. Running migration...");
      const fs = require("fs");
      const sql = fs.readFileSync(path.join(__dirname, "init.sql"), "utf8");
      await db.query(sql);
      console.log("Migration complete! Database initialized with sports data.");
    } else {
      console.log("Database already initialized.");
    }

    await createSampleWorkouts();
  } catch (e) {
    console.error("Database initialization error:", e);
  }
}

async function createSampleWorkouts() {
  try {
    const workoutCount = await db.query("SELECT COUNT(*) FROM workouts");
    if (parseInt(workoutCount.rows[0].count) > 0) {
      console.log("Sample workouts already exist.");
      return;
    }

    console.log("Creating sample users and workouts...");
    const sampleUsers = [
      { name: "Alex Johnson", email: "alex@example.com", sport: "Football" },
      { name: "Maria Garcia", email: "maria@example.com", sport: "Basketball" },
      { name: "James Chen", email: "james@example.com", sport: "Athletics" },
      { name: "Sarah Williams", email: "sarah@example.com", sport: "Swimming" },
      { name: "Tom Anderson", email: "tom@example.com", sport: "Cycling" },
      { name: "Emma Davis", email: "emma@example.com", sport: "Tennis" },
      { name: "Mike Brown", email: "mike@example.com", sport: "Volleyball" },
      { name: "Lisa Wilson", email: "lisa@example.com", sport: "Golf" },
    ];

    for (const user of sampleUsers) {
      const passwordHash = await bcrypt.hash("sample123", 10);
      const userResult = await db.query(
        "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id",
        [user.name, user.email, passwordHash],
      );
      const userId = userResult.rows[0].id;

      const sportResult = await db.query(
        "SELECT id FROM sports WHERE name = $1",
        [user.sport],
      );
      const sportId = sportResult.rows[0].id;

      await db.query(
        "INSERT INTO user_sports (user_id, sport_id) VALUES ($1, $2)",
        [userId, sportId],
      );

      const workouts = getSampleWorkoutsForSport(user.sport);
      for (const workout of workouts) {
        await db.query(
          "INSERT INTO workouts (user_id, exercise, sport_id, sets, reps, distance, duration, notes, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
          [
            userId,
            workout.exercise,
            sportId,
            workout.sets,
            workout.reps,
            workout.distance,
            workout.duration,
            workout.notes,
            new Date(Date.now() - workout.daysAgo * 24 * 60 * 60 * 1000),
          ],
        );
      }
    }

    console.log("Sample workouts created successfully!");
  } catch (e) {
    console.error("Error creating sample workouts:", e);
  }
}

function getSampleWorkoutsForSport(sport) {
  const workoutData = {
    Football: [
      {
        exercise: "Sprint Drills",
        sets: "5",
        reps: "10",
        distance: "100m",
        duration: "45 min",
        notes: "Focused on acceleration",
        daysAgo: 1,
      },
      {
        exercise: "Ball Control Training",
        sets: null,
        reps: null,
        distance: null,
        duration: "60 min",
        notes: "Dribbling and passing drills",
        daysAgo: 3,
      },
      {
        exercise: "Tactical Session",
        sets: null,
        reps: null,
        distance: "5km",
        duration: "90 min",
        notes: "Team formation practice",
        daysAgo: 5,
      },
    ],
    Basketball: [
      {
        exercise: "Free Throw Practice",
        sets: "10",
        reps: "20",
        distance: null,
        duration: "30 min",
        notes: "85% accuracy today",
        daysAgo: 1,
      },
      {
        exercise: "Defensive Drills",
        sets: null,
        reps: null,
        distance: null,
        duration: "45 min",
        notes: "One-on-one defense focus",
        daysAgo: 2,
      },
      {
        exercise: "Scrimmage Game",
        sets: null,
        reps: null,
        distance: null,
        duration: "60 min",
        notes: "Full court 5v5",
        daysAgo: 4,
      },
    ],
    Athletics: [
      {
        exercise: "Track Intervals",
        sets: "8",
        reps: "400m",
        distance: "3.2km",
        duration: "40 min",
        notes: "Hit all target times",
        daysAgo: 1,
      },
      {
        exercise: "Long Distance Run",
        sets: null,
        reps: null,
        distance: "10km",
        duration: "50 min",
        notes: "Easy pace recovery run",
        daysAgo: 3,
      },
      {
        exercise: "Hill Sprints",
        sets: "6",
        reps: "10",
        distance: "200m",
        duration: "35 min",
        notes: "Tough but good session",
        daysAgo: 6,
      },
    ],
    Swimming: [
      {
        exercise: "Freestyle Intervals",
        sets: "10",
        reps: "100m",
        distance: "1000m",
        duration: "45 min",
        notes: "Great technique today",
        daysAgo: 1,
      },
      {
        exercise: "Endurance Session",
        sets: null,
        reps: null,
        distance: "2000m",
        duration: "55 min",
        notes: "Steady pace throughout",
        daysAgo: 2,
      },
      {
        exercise: "Mixed Stroke Practice",
        sets: "8",
        reps: "50m",
        distance: "400m",
        duration: "40 min",
        notes: "Butterfly still needs work",
        daysAgo: 5,
      },
    ],
    Cycling: [
      {
        exercise: "Hill Climbing",
        sets: null,
        reps: null,
        distance: "25km",
        duration: "75 min",
        notes: "Conquered the big hill!",
        daysAgo: 1,
      },
      {
        exercise: "Interval Training",
        sets: "12",
        reps: "1min",
        distance: "30km",
        duration: "60 min",
        notes: "High intensity intervals",
        daysAgo: 3,
      },
      {
        exercise: "Long Ride",
        sets: null,
        reps: null,
        distance: "80km",
        duration: "180 min",
        notes: "Beautiful weather",
        daysAgo: 7,
      },
    ],
    Tennis: [
      {
        exercise: "Serve Practice",
        sets: "10",
        reps: "20",
        distance: null,
        duration: "45 min",
        notes: "Working on second serve",
        daysAgo: 1,
      },
      {
        exercise: "Match Play",
        sets: "3",
        reps: null,
        distance: null,
        duration: "120 min",
        notes: "Won 2-1 in sets",
        daysAgo: 2,
      },
      {
        exercise: "Footwork Drills",
        sets: "8",
        reps: "15",
        distance: null,
        duration: "40 min",
        notes: "Agility improving",
        daysAgo: 4,
      },
    ],
    Volleyball: [
      {
        exercise: "Spike Training",
        sets: "15",
        reps: "10",
        distance: null,
        duration: "50 min",
        notes: "Power and accuracy focus",
        daysAgo: 1,
      },
      {
        exercise: "Team Practice",
        sets: null,
        reps: null,
        distance: null,
        duration: "90 min",
        notes: "Rotation drills and scrimmage",
        daysAgo: 3,
      },
      {
        exercise: "Blocking Technique",
        sets: "10",
        reps: "12",
        distance: null,
        duration: "45 min",
        notes: "Timing is getting better",
        daysAgo: 5,
      },
    ],
    Golf: [
      {
        exercise: "Driving Range",
        sets: null,
        reps: "100",
        distance: null,
        duration: "60 min",
        notes: "Driver felt great today",
        daysAgo: 1,
      },
      {
        exercise: "Putting Practice",
        sets: "20",
        reps: "10",
        distance: null,
        duration: "45 min",
        notes: "Working on distance control",
        daysAgo: 2,
      },
      {
        exercise: "18 Holes",
        sets: null,
        reps: null,
        distance: "6km",
        duration: "240 min",
        notes: "Shot 84, happy with that",
        daysAgo: 4,
      },
    ],
  };

  return workoutData[sport] || [];
}

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Web service listening on :${PORT}`);

  initializeDatabase()
    .then(() => console.log("Database initialization completed"))
    .catch((err) =>
      console.error("Database initialization failed (non-fatal):", err.message),
    );
});
