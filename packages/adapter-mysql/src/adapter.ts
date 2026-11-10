import type { DatabaseAdapter } from "@ai-database-safety-experiment/core";
import { closeQuietly, openConnection } from "#/connection";
import { runReadOnlyQuery } from "#/query";
import {
  createAgentUser,
  grantUnrestricted,
  readAppliedAccess,
  setAgentUserPassword,
} from "#/unrestricted";

/** The MySQL Database Adapter. */
export const mysqlAdapter: DatabaseAdapter = {
  openAdminSession: async (settings) => {
    const connection = await openConnection(settings);
    return {
      readAppliedAccess: (target) => readAppliedAccess(connection, target),
      createAgentUser: (agentUser, password) => createAgentUser(connection, agentUser, password),
      setAgentUserPassword: (agentUser, password) =>
        setAgentUserPassword(connection, agentUser, password),
      grantUnrestricted: (target) => grantUnrestricted(connection, target),
      close: () => closeQuietly(connection),
    };
  },
  runReadOnlyQuery,
};
