'use client';

import { use, useState } from 'react';
import { Page, PageHeader } from '@/components/page';
import { ProjectFiles } from '@/components/project/files';
import { useQuery } from '@/lib/hooks';

export default function FilesPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  const [projectId, setProjectId] = useState('');
  const { data: projects } = useQuery<{ id: string; key: string; name: string }[]>('/api/projects', [workspaceId]);

  return (
    <Page>
      <PageHeader
        title="Files"
        subtitle="Images, PDFs, video, archives and documents with folders and version history"
        actions={
          <select className="select w-auto" value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Filter by project">
            <option value="">All projects</option>
            {(projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.key} · {project.name}
              </option>
            ))}
          </select>
        }
      />
      <ProjectFiles key={projectId} workspaceId={workspaceId} projectId={projectId || undefined} />
    </Page>
  );
}
