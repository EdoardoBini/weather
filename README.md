# 🚀 Application Setup and Running Guide

This guide outlines the steps for setting up the development environment and running the application, using either Docker Compose or local development methods.

---

## 🛠️ Preliminary Setup

Before starting, ensure you have the necessary tools installed:

- **Node Version Manager (nvm):** Install **nvm** to manage Node.js and npm (v10.8.2) versions.
  - Once installed, execute the following command to use the required version:
    ```bash
    nvm install v20.19
    nvm use v20.19
    ```
- **Docker:** Install the **Latest Version for Docker**.

---

## 1. ⚙️ Environment Setup

You need to configure your API credentials for the application:

- **Create the Environment File:**
  - Create a local environment file by copying the example configuration:
    ```bash
    cp .env.example .env
    ```
- **Configure API Key:**
  - Open the newly created **`.env`** file and provide your API credentials for your **OpenCage API key**:
    ```dotenv
    OPENCAGE_API_KEY=your_actual_api_key_here
    ```

---

## 2. 🏃 Running the Application

You have two options for running the application: **Docker Compose** or **Local Development**.

### 2.1. Docker Compose (Recommended)

This is the recommended method for consistent environment deployment.

- To **build** and **launch** the application using Docker Compose, execute:
  ```bash
  docker-compose up --build
  ```

### 2.2. Local Development

This is the method for running the application directly on your local machine.

- **Installation and Running:**
  - To set up the project locally, first install all required packages:
    ```bash
    npm i
    ```
  - Then, run the application:
    ```bash
    npm run start
    ```
- **Geocoding API Configuration (Local Dev Only):**
  - To enable the geocoding API during local development, you **must manually provide the API key** inside the **`server.ts`** file.
  - Update the following line as needed:
    ```typescript
    opencageApiKey: process.env['OPENCAGE_API_KEY'] || 'your_api_key_here';
    ```

> **⚠️ Security Warning for Local Development Fallback:**
> This fallback value (`'your_api_key_here'`) is intended **exclusively for development environments** and **must never be used in production builds**. Embedding API keys directly in source code introduces a serious **security risk**, as it exposes the credential to anyone with access to the compiled frontend files, browser DevTools, or the public repository. In production, always load API keys from **environment variables** or **secure configuration systems**.
