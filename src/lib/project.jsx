import { createContext, useContext } from 'react';

export const ProjectContext = createContext(null);

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error('useProject() must be used inside <ProjectLoader>. Make sure this component is rendered under /p/:projectSlug/*.');
  }
  return ctx;
}
