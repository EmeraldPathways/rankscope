# Restarting RankScope in Sites

RankScope must always be restored from its source repository. Do not recreate the project from an empty folder or rely on the temporary local workspace.

## Recovery checklist

1. Reopen the existing Sites project with the same project, not a new Site.
2. If the local checkout is missing, clone the Site source repository into a new empty folder. The GitHub mirror is also available at `EmeraldPathways/rankscope`, branch `database-fix@GitHub`.
3. Confirm `.openai/hosting.json` still contains the existing `project_id` and `"d1": "DB"`.
4. Install exactly from the lockfile with `npm ci`.
5. Run `npm run verify:project`. Stop if it reports missing files, a missing manifest, or missing migrations.
6. Run `npm test` before publishing.
7. Keep Google and SEO credentials in Sites runtime environment variables. Never store them in Git.
8. Push the complete source, package the exact pushed commit, save a Sites version, and deploy that saved version.
9. After deployment, confirm the D1 database still contains `workspace_snapshots` and test the owner-only workspace endpoint.

The Sites source repository and GitHub branch are the durable copies. The local scratch checkout is only a working copy and may be cleared after inactivity.
