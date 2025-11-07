<template>
  <div class="app-shell">
    <nav class="nav">
      <RouterLink to="/" class="logo">PDF 智能助手</RouterLink>
      <div class="links">
        <RouterLink to="/">单文件模式</RouterLink>
        <RouterLink to="/batch">批量模式</RouterLink>
      </div>
    </nav>
    <RouterView />
  </div>
</template>

<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 0;
  gap: 1rem;
}

.logo {
  font-weight: 600;
  text-decoration: none;
  color: #111827;
}

.links {
  display: flex;
  gap: 1rem;
}

.links a {
  text-decoration: none;
  color: #475569;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
}

.links a.router-link-active {
  color: #fff;
  background: #2563eb;
}
</style>
