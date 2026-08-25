import { messageOf, privateApi, toArray, toPage, unwrap } from '@/lib/api';
import { API } from '@/lib/endpoints';
import type {
    Department,
    Project,
    Report,
    ReportStatus,
    Task,
    TaskPriority,
    TaskStatus,
    User,
} from '@/types';
import type {
    DepartmentDto,
    ProjectDto,
    ReportDto,
    StaffDto,
    TaskDto,
    UserDropdownDto,
} from '@/types/api';

// ── Mappers ────────────────────────────────────────────────────────────────

function mapTask(dto: TaskDto): Task {
  return {
    id: String(dto.id),
    title: dto.title,
    description: dto.description ?? undefined,
    status: (dto.status ?? 'pending') as TaskStatus,
    priority: (dto.priority ?? 'medium') as TaskPriority,
    projectId: dto.project ?? undefined,
    assigneeName: dto.assigned_to || undefined,
    assignerName: dto.assigned_by || undefined,
    assigneeRole: dto.user_role || undefined,
    dueDate: dto.deadline ?? undefined,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

function mapProject(dto: ProjectDto): Project {
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description ?? undefined,
    startDate: dto.start_date ?? undefined,
    // The API calls the end of a project its `deadline`.
    endDate: dto.deadline ?? undefined,
    createdAt: dto.created_at,
  };
}

function mapReport(dto: ReportDto): Report {
  return {
    id: String(dto.id),
    body: dto.note ?? undefined,
    status: (dto.status ?? 'pending') as ReportStatus,
    authorName: dto.username,
    authorEmail: dto.email,
    authorRole: dto.user_role,
    createdAt: dto.created_at,
  };
}

function mapStaff(dto: StaffDto): User {
  return {
    id: String(dto.id),
    fullName: dto.name,
    email: dto.email,
    role: dto.role_display || 'Staff',
    roleId: dto.role ?? undefined,
    employeeId: dto.employee_id ?? undefined,
    department: dto.department_name || undefined,
    location: dto.location,
    locationLabel: dto.location_display,
    initials: dto.initials,
    avatarUrl: dto.profile_photo_url || undefined,
    isActive: dto.is_active ?? true,
  };
}

function mapDepartment(dto: DepartmentDto): Department {
  return {
    id: String(dto.id),
    name: dto.name,
    description: dto.description ?? undefined,
    isActive: dto.is_active ?? true,
  };
}

// ── Tasks ──────────────────────────────────────────────────────────────────

export interface TaskFilters {
  page?: number;
  size?: number;
  search?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee?: string;
  /** Server-side scoping to one project. */
  project_id?: string;
  ordering?: string;
}

export const taskService = {
  async list(filters: TaskFilters = {}): Promise<{ items: Task[]; count: number }> {
    const res = await privateApi.get(API.TASKS, { params: filters });
    const page = toPage<TaskDto>(res);
    return { items: page.items.map(mapTask), count: page.count };
  },

  async get(id: string): Promise<Task> {
    const res = await privateApi.get(API.task(id));
    return mapTask(unwrap<TaskDto>(res));
  },

  async create(input: {
    projectId: string;
    title: string;
    description?: string;
    assignedTo: number;
    priority?: TaskPriority;
    status?: TaskStatus;
    deadline?: string;
  }) {
    const res = await privateApi.post(API.TASKS, {
      project: input.projectId,
      title: input.title,
      description: input.description ?? null,
      assigned_to: input.assignedTo,
      priority: input.priority ?? 'medium',
      status: input.status ?? 'pending',
      deadline: input.deadline ?? null,
    });
    return messageOf(res, 'Task created');
  },

  /** Partial update — used for status moves on the board. */
  async updateStatus(id: string, status: TaskStatus) {
    const res = await privateApi.patch(API.task(id), { status });
    return messageOf(res, 'Status updated');
  },

  async update(
    id: string,
    input: Partial<{
      title: string;
      description: string;
      assignedTo: number;
      priority: TaskPriority;
      status: TaskStatus;
      deadline: string;
    }>,
  ) {
    const res = await privateApi.patch(API.task(id), {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.assignedTo !== undefined && { assigned_to: input.assignedTo }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.deadline !== undefined && { deadline: input.deadline }),
    });
    return messageOf(res, 'Task updated');
  },

  async remove(id: string) {
    await privateApi.delete(API.task(id));
  },
};

// ── Projects ───────────────────────────────────────────────────────────────

export const projectService = {
  async list(params: { page?: number; size?: number } = {}): Promise<Project[]> {
    const res = await privateApi.get(API.PROJECTS, { params });
    return toArray<ProjectDto>(res).map(mapProject);
  },

  async get(id: string): Promise<Project> {
    const res = await privateApi.get(API.project(id));
    return mapProject(unwrap<ProjectDto>(res));
  },

  async create(input: { name: string; description?: string; startDate?: string; deadline?: string }) {
    const res = await privateApi.post(API.PROJECTS, {
      name: input.name,
      description: input.description ?? null,
      start_date: input.startDate ?? null,
      deadline: input.deadline ?? null,
    });
    return messageOf(res, 'Project created');
  },

  async update(
    id: string,
    input: Partial<{ name: string; description: string; startDate: string; deadline: string }>,
  ) {
    const res = await privateApi.patch(API.project(id), {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.startDate !== undefined && { start_date: input.startDate }),
      ...(input.deadline !== undefined && { deadline: input.deadline }),
    });
    return messageOf(res, 'Project updated');
  },

  async remove(id: string) {
    await privateApi.delete(API.project(id));
  },
};

// ── Reports ────────────────────────────────────────────────────────────────

export const reportService = {
  async list(): Promise<Report[]> {
    const res = await privateApi.get(API.REPORTS);
    return toArray<ReportDto>(res).map(mapReport);
  },

  async get(id: string): Promise<Report> {
    const res = await privateApi.get(API.report(id));
    return mapReport(unwrap<ReportDto>(res));
  },

  /** A report must be attached to a task (`parent_task` is required). */
  async create(input: { parentTaskId: number; note: string; status?: ReportStatus }) {
    const res = await privateApi.post(API.REPORTS, {
      parent_task: input.parentTaskId,
      note: input.note,
      status: input.status ?? 'pending',
    });
    return messageOf(res, 'Report submitted');
  },

  async update(id: string, input: Partial<{ note: string; status: ReportStatus }>) {
    const res = await privateApi.patch(API.report(id), {
      ...(input.note !== undefined && { note: input.note }),
      ...(input.status !== undefined && { status: input.status }),
    });
    return messageOf(res, 'Report updated');
  },

  async remove(id: string) {
    await privateApi.delete(API.report(id));
  },
};

// ── Staff / HR ─────────────────────────────────────────────────────────────

export const staffService = {
  async list(params: { page?: number; size?: number } = {}): Promise<{ items: User[]; count: number }> {
    const res = await privateApi.get(API.STAFF, { params });
    const page = toPage<StaffDto>(res);
    return { items: page.items.map(mapStaff), count: page.count };
  },

  async get(id: string): Promise<User> {
    const res = await privateApi.get(API.staff(id));
    return mapStaff(unwrap<StaffDto>(res));
  },

  async update(
    id: string,
    input: Partial<{ name: string; email: string; employeeId: string; isActive: boolean; roleId: number }>,
  ) {
    const res = await privateApi.patch(API.staff(id), {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.employeeId !== undefined && { employee_id: input.employeeId }),
      ...(input.isActive !== undefined && { is_active: input.isActive }),
      ...(input.roleId !== undefined && { role: input.roleId }),
    });
    return messageOf(res, 'Member updated');
  },

  /** Lightweight active-user list, used for assignee pickers. */
  async dropdown(): Promise<{ id: number; label: string; email: string }[]> {
    const res = await privateApi.get(API.USER_DROPDOWN);
    return toArray<UserDropdownDto>(res).map((u) => ({ id: u.id, label: u.label, email: u.email }));
  },
};

export const departmentService = {
  async list(): Promise<Department[]> {
    const res = await privateApi.get(API.DEPARTMENTS);
    return toArray<DepartmentDto>(res).map(mapDepartment);
  },

  async create(input: { name: string; description?: string }) {
    const res = await privateApi.post(API.DEPARTMENTS, {
      name: input.name,
      description: input.description ?? null,
    });
    return messageOf(res, 'Department created');
  },

  async update(id: string, input: Partial<{ name: string; description: string; isActive: boolean }>) {
    const res = await privateApi.patch(API.department(id), {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.isActive !== undefined && { is_active: input.isActive }),
    });
    return messageOf(res, 'Department updated');
  },

  async remove(id: string) {
    await privateApi.delete(API.department(id));
  },
};

export { mapDepartment, mapProject, mapReport, mapStaff, mapTask };

