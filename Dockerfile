# Stage 1: Build the React Client
FROM node:22-alpine AS builder

WORKDIR /app/client

# Install client dependencies
COPY client/package*.json ./
RUN npm install

# Copy client source code and build
COPY client/ ./
RUN npm run build

# Stage 2: Setup the Node.js Express Backend
FROM node:22-alpine

# Install SQLite dependencies (sqlite3 and sqlite-vec require compilation)
RUN apk add --no-cache python3 py3-setuptools make g++

WORKDIR /app

# Install backend dependencies
COPY package*.json ./
RUN npm install --production

# Copy backend source code
COPY . .

# Copy built frontend assets from the builder stage
COPY --from=builder /app/client/dist ./client/dist

# Expose the application port
EXPOSE 8080

# Start the Node.js server
CMD ["npm", "start"]
