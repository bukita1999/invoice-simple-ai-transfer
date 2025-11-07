# syntax=docker/dockerfile:1.6

##
# Build stage: install dependencies and produce the Vite static bundle.
##
FROM node:20-alpine AS build

WORKDIR /app

# Install exact dependency tree first to leverage Docker layer caching.
COPY package*.json ./
RUN npm ci

# Copy the rest of the source and provide build-time variables for Vite.
COPY . .

ARG VITE_OPENAI_API_KEY
ARG VITE_OPENAI_BASE_URL=https://api.openai.com/v1
ARG VITE_OPENAI_MODEL=gpt-4o-mini
ENV VITE_OPENAI_API_KEY=$VITE_OPENAI_API_KEY \
    VITE_OPENAI_BASE_URL=$VITE_OPENAI_BASE_URL \
    VITE_OPENAI_MODEL=$VITE_OPENAI_MODEL

RUN npm run build

##
# Runtime stage: serve the static files via Nginx.
##
FROM nginx:1.27-alpine AS runtime

# Replace the default server block so SPA routes fall back to index.html.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
