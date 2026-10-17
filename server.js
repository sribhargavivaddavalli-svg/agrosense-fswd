
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
require("dotenv").config();

const pool = require("./db");
const app = express();

app.use(cors());
app.use(express.json());

// Handle invalid JSON requests
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        return res.status(400).json({
            message: "Invalid JSON. Please send valid JSON data."
        });
    }

    next(err);
});

// Home route
app.get("/", (req, res) => {
    res.send("AgroSense Backend is Running!");
});

// Test PostgreSQL connection
app.get("/api/db-test", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");

        res.json({
            message: "PostgreSQL connected successfully!",
            time: result.rows[0].now
        });
    } catch (error) {
        console.error("Database error:", error.message);

        res.status(500).json({
            message: "Database connection failed"
        });
    }
});

// Register a new user
app.post("/api/auth/register", async (req, res) => {
    try {
        const { userId, name, password } = req.body || {};

        if (
            typeof userId !== "string" || !userId.trim() ||
            typeof name !== "string" || !name.trim() ||
            typeof password !== "string" || !password
        ) {
            return res.status(400).json({
                message: "User ID, name and password are required"
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `INSERT INTO users (user_id, name, password_hash)
             VALUES ($1, $2, $3)
             RETURNING id, user_id, name, created_at`,
            [userId.trim(), name.trim(), passwordHash]
        );

        res.status(201).json({
            message: "Registration successful!",
            user: result.rows[0]
        });
    } catch (error) {
        if (error.code === "23505") {
            return res.status(409).json({
                message: "User ID already exists"
            });
        }

        console.error("Registration error:", error.message);

        res.status(500).json({
            message: "Registration failed"
        });
    }
});

// Login using PostgreSQL user credentials
app.post("/api/auth/login", async (req, res) => {
    try {
        const { userId, password } = req.body || {};

        if (
            typeof userId !== "string" || !userId.trim() ||
            typeof password !== "string" || !password
        ) {
            return res.status(400).json({
                message: "User ID and password are required"
            });
        }

        const result = await pool.query(
            `SELECT id, user_id, name, password_hash
             FROM users
             WHERE user_id = $1`,
            [userId.trim()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                message: "Invalid user ID or password"
            });
        }

        const user = result.rows[0];

        const passwordMatches = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                message: "Invalid user ID or password"
            });
        }

        res.json({
            message: "Login successful!",
            user: {
                id: user.id,
                userId: user.user_id,
                name: user.name
            }
        });
    } catch (error) {
        console.error("Login error:", error.message);

        res.status(500).json({
            message: "Login failed"
        });
    }
});

// Get the latest sensor reading from PostgreSQL
app.get("/api/sensors", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT *
             FROM sensor_readings
             ORDER BY recorded_at DESC, id DESC
             LIMIT 1`
        );

        // Return empty sensor values if no reading exists yet
        if (result.rows.length === 0) {
            return res.json({
                soilMoisture: null,
                temperature: null,
                humidity: null,
                lightIntensity: null,
                irrigationOn: false,
                recordedAt: null
            });
        }

        const reading = result.rows[0];

        res.json({
            soilMoisture: Number(reading.soil_moisture),
            temperature: Number(reading.temperature),
            humidity: Number(reading.humidity),
            lightIntensity: Number(reading.light_intensity),
            irrigationOn: reading.irrigation_on,
            recordedAt: reading.recorded_at
        });
    } catch (error) {
        console.error("Fetch sensor error:", error.message);

        res.status(500).json({
            message: "Failed to fetch sensor readings"
        });
    }
});

// Save sensor readings to PostgreSQL
app.post("/api/sensors", async (req, res) => {
    try {
        if (
            !req.body ||
            typeof req.body !== "object" ||
            Array.isArray(req.body)
        ) {
            return res.status(400).json({
                message: "Request body is missing. Select Body > raw > JSON in Postman."
            });
        }

        const {
            soilMoisture,
            temperature,
            humidity,
            lightIntensity,
            irrigationOn
        } = req.body;

        if (
            soilMoisture == null ||
            temperature == null ||
            humidity == null ||
            lightIntensity == null
        ) {
            return res.status(400).json({
                message: "Please provide all sensor readings"
            });
        }

        if (
            ![soilMoisture, temperature, humidity, lightIntensity].every(
                value =>
                    typeof value === "number" &&
                    Number.isFinite(value)
            )
        ) {
            return res.status(400).json({
                message: "Sensor readings must be valid numbers"
            });
        }

        if (
            irrigationOn !== undefined &&
            typeof irrigationOn !== "boolean"
        ) {
            return res.status(400).json({
                message: "irrigationOn must be true or false"
            });
        }

        const values = [
            soilMoisture,
            temperature,
            humidity,
            lightIntensity,
            irrigationOn ?? false
        ];

        const result = await pool.query(
            `INSERT INTO sensor_readings
             (soil_moisture, temperature, humidity, light_intensity, irrigation_on)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            values
        );

        const reading = result.rows[0];

        res.status(201).json({
            message: "Sensor reading saved successfully!",
            reading: {
                id: reading.id,
                soilMoisture: Number(reading.soil_moisture),
                temperature: Number(reading.temperature),
                humidity: Number(reading.humidity),
                lightIntensity: Number(reading.light_intensity),
                irrigationOn: reading.irrigation_on,
                recordedAt: reading.recorded_at
            }
        });
    } catch (error) {
        console.error("Save sensor error:", error.message);

        res.status(500).json({
            message: "Failed to save sensor reading"
        });
    }
});

// Start the server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`AgroSense server running on port ${PORT}`);
});

