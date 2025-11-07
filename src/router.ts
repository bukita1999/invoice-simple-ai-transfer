import { createRouter, createWebHistory } from 'vue-router';
import SingleAnalyzer from './pages/SingleAnalyzer.vue';
import BatchAnalyzer from './pages/BatchAnalyzer.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: SingleAnalyzer },
    { path: '/batch', component: BatchAnalyzer }
  ]
});
