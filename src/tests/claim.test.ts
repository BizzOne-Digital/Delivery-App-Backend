import { describe, it, expect } from "vitest";
import { User } from "../models/User.js";
import { Company } from "../models/Company.js";
import { Pharmacy } from "../models/Pharmacy.js";
import { Customer } from "../models/Customer.js";
import { Order } from "../models/Order.js";
import { hashPassword } from "../services/authService.js";
import { claimOrdersAtomic } from "../services/orderClaimService.js";
import { UserRole, OrderStatus, DriverOnboardingStatus } from "../types/enums.js";
import { DispatchMode } from "../types/enums.js";

describe("atomic claim", () => {
  it("allows exactly one winner when two drivers claim concurrently", async () => {
    const company = await Company.create({ name: "Test Co", code: "TC" });
    const passwordHash = await hashPassword("password123");
    const inserted = await User.insertMany([
      {
        firstName: "A",
        lastName: "Driver",
        email: "d1@test.com",
        passwordHash,
        role: UserRole.DRIVER,
        companyId: company._id,
        active: true,
        onboardingStatus: DriverOnboardingStatus.APPROVED,
        driverStatus: "AVAILABLE",
        serviceZones: [{ zoneId: "z1", name: "Z", centerLat: 43.65, centerLng: -79.38, radiusKm: 50 }],
      },
      {
        firstName: "B",
        lastName: "Driver",
        email: "d2@test.com",
        passwordHash,
        role: UserRole.DRIVER,
        companyId: company._id,
        active: true,
        onboardingStatus: DriverOnboardingStatus.APPROVED,
        driverStatus: "AVAILABLE",
        serviceZones: [{ zoneId: "z1", name: "Z", centerLat: 43.65, centerLng: -79.38, radiusKm: 50 }],
      },
    ]);
    const d1 = inserted[0]!;
    const d2 = inserted[1]!;
    const pharmacy = await Pharmacy.create({
      companyId: company._id,
      name: "Rx One",
      code: "RX1",
      displayColor: "#3B82F6",
      email: "rx@test.com",
      phone: "111",
      address: "1 Main",
      latitude: 43.65,
      longitude: -79.38,
      serviceZones: [{ zoneId: "z1", name: "Toronto", centerLat: 43.65, centerLng: -79.38, radiusKm: 30 }],
      linkedDriverIds: [d1._id, d2._id],
      dispatchMode: DispatchMode.HYBRID,
      active: true,
    });
    const customer = await Customer.create({
      companyId: company._id,
      pharmacyIds: [pharmacy._id],
      firstName: "Pat",
      lastName: "IENT",
      phone: "999",
    });
    const order = await Order.create({
      referenceNumber: "JD-TEST-1",
      companyId: company._id,
      pharmacyId: pharmacy._id,
      customerId: customer._id,
      status: OrderStatus.READY,
      deliveryDate: new Date(Date.now() + 3600000),
      pickupAddress: pharmacy.address,
      pickupCoordinates: { latitude: 43.65, longitude: -79.38 },
      deliveryAddress: "2 Oak St",
      deliveryCoordinates: { latitude: 43.66, longitude: -79.39 },
      packageCount: 1,
    });

    const [r1, r2] = await Promise.all([
      claimOrdersAtomic(d1, [String(order._id)]),
      claimOrdersAtomic(d2, [String(order._id)]),
    ]);
    const wins = [...r1, ...r2].filter((r) => r.success);
    expect(wins.length).toBe(1);
    const updated = await Order.findById(order._id);
    expect(updated?.claimedAt).toBeTruthy();
  });
});
