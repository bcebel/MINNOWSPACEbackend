import Neighborhood from "../structure/models/Neighborhood.js";

/**
 * Ensures user is a member of the neighborhood and optionally checks role.
 */
export const requireNeighborhoodAccess = async (
  neighborhoodId,
  userId,
  requiredRoles = [],
) => {
  if (!neighborhoodId) throw new Error("Neighborhood ID is required.");

  const neighborhood = await Neighborhood.findById(neighborhoodId);
  if (!neighborhood) throw new Error("Neighborhood not found.");

  const member = neighborhood.members.find(
    (m) => m.user.toString() === userId.toString(),
  );

  if (!member) {
    throw new Error(
      "Access denied: You are not a member of this neighborhood.",
    );
  }

  if (requiredRoles.length > 0 && !requiredRoles.includes(member.role)) {
    throw new Error("Access denied: Insufficient permissions.");
  }

  return { neighborhood, member };
};
