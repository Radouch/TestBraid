import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import AdminView from './views/AdminView.vue'
import TestView from './views/TestView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/admin', name: 'admin', component: AdminView },
    { path: '/tests/:id', name: 'test', component: TestView },
  ],
})
