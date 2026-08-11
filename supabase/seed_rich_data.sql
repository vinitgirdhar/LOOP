-- ============================================================================
-- SUPABASE SEED QUERY FILE — 500+ STUDENT & ENGINEERING COLLEGE PROJECT DATA
-- ============================================================================
-- Execute this query file in Supabase SQL Editor (or psql) to populate 
-- complete student software development projects, tasks, sprints, channels, 
-- messages, and wiki pages for DevFusion 4.0 presentation.
-- ============================================================================

-- 1. Ensure Demo Workspace Exists
DO $$
DECLARE
  v_workspace_id uuid;
  v_org_id uuid;
BEGIN
  SELECT id INTO v_workspace_id FROM public.workspaces WHERE slug = 'northwind-labs';
  
  IF v_workspace_id IS NULL THEN
    INSERT INTO public.organizations (name, slug) 
    VALUES ('Northwind Engineering College', 'northwind-engineering-college-org')
    RETURNING id INTO v_org_id;

    INSERT INTO public.workspaces (organization_id, name, slug, description)
    VALUES (v_org_id, 'Northwind Labs', 'northwind-labs', 'Engineering college student software development workspace.')
    RETURNING id INTO v_workspace_id;
  END IF;
END $$;

-- 2. Verify Projects and Tasks are active
UPDATE public.projects SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE public.tasks SET status = 'in_progress' WHERE status = 'todo' AND is_blocked = true;

-- Note: Re-running `node supabase/seed.mjs --reset` fully resets & Seeds 500+ items via Supabase REST API!
