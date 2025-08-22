# Use Node.js 20 with Debian bookworm (recommended for Playwright)
FROM node:20-bookworm

# Set working directory
WORKDIR /app

# Create non-root user first
RUN adduser --disabled-password --gecos '' pwuser

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --only=production

# Install Playwright browsers as root first
RUN npx playwright install --with-deps chromium

# Copy browsers to non-root user's cache directory
RUN mkdir -p /home/pwuser/.cache/ms-playwright \
    && cp -r /root/.cache/ms-playwright/* /home/pwuser/.cache/ms-playwright/ \
    && chown -R pwuser:pwuser /home/pwuser/.cache/ms-playwright

# Copy application code
COPY . .

# Change ownership to pwuser
RUN chown -R pwuser:pwuser /app

# Switch to non-root user
USER pwuser

# Expose port (if needed for health checks)
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production

# Start the application
CMD ["npm", "run", "monitor"]
