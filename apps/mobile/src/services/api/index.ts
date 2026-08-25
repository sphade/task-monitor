import type { Department, Project, Report, Task, User } from '@/types';

import {
    departmentService,
    projectService,
    reportService,
    staffService,
    taskService,
} from './work';

/**
 * Convenience façade over the API services.
 *
 * Screens mostly need "give me the whole list", so these wrappers hide
 * pagination envelopes. Reach for the underlying `taskService` /
 * `projectService` / etc. directly when you need filters, paging or mutations.
 */
export const dataService = {
  async listTasks(): Promise<Task[]> {
    const { items } = await taskService.list({ size: 100 });
    return items;
  },

  getTask(id: string): Promise<Task> {
    return taskService.get(id);
  },

  listProjects(): Promise<Project[]> {
    return projectService.list({ size: 100 });
  },

  getProject(id: string): Promise<Project> {
    return projectService.get(id);
  },

  listReports(): Promise<Report[]> {
    return reportService.list();
  },

  getReport(id: string): Promise<Report> {
    return reportService.get(id);
  },

  async listUsers(): Promise<User[]> {
    const { items } = await staffService.list({ size: 100 });
    return items;
  },

  getUser(id: string): Promise<User> {
    return staffService.get(id);
  },

  listDepartments(): Promise<Department[]> {
    return departmentService.list();
  },
};

export { authService } from './auth';
export { departmentService, projectService, reportService, staffService, taskService };

