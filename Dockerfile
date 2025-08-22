# Use Node.js 20 with Debian bookworm (recommended for Playwright)
FROM node:20-bookworm

# Set working directory
WORKDIR /app

# Install system dependencies and Playwright browsers
RUN npx -y playwright@1.40.0 install --with-deps chromium

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --only=production

# Copy application code
COPY . .

# Create non-root user for security (recommended for web scraping)
RUN adduser --disabled-password --gecos '' pwuser && \
    chown -R pwuser:pwuser /app

# Switch to non-root user
USER pwuser

# Expose port (if needed for health checks)
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production

# Start the application
CMD ["npm", "run", "monitor"]
