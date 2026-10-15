import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../createHttpApp.js";
import { User } from "../models/User.js";
import { Company } from "../models/Company.js";
import { Pharmacy } from "../models/Pharmacy.js";
import { Customer } from "../models/Customer.js";
import { Order } from "../models/Order.js";
import { hashPassword } from "../services/authService.js";
import { UserRole, OrderStatus, DispatchMode } from "../types/enums.js";

const app = createApp();
const password = "TestPass123!";

async function login(email: string) {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.data.accessToken as string;
}

describe("auth & routes", () => {
  let patientToken: string;
  let driverToken: string;
  let pharmacyToken: string;
  let customerId: string;

  beforeEach(async () => {
    const company = await Company.create({ name: "Auth Co", code: `AUTH-${Date.now()}` });
    const passwordHash = await hashPassword(password);

    const pharmacy = await Pharmacy.create({
      companyId: company._id,
      name: "Test Rx",
      code: `TRX-${Date.now()}`,
      displayColor: "#3B82F6",
      email: "rx@test.com",
      phone: "1",
      address: "1 St",
      latitude: 43.65,
      longitude: -79.38,
      serviceZones: [
        { zoneId: "z", name: "Z", centerLat: 43.65, centerLng: -79.38, radiusKm: 50 },
      ],
      dispatchMode: DispatchMode.HYBRID,
      active: true,
    });

    const patient = await User.create({
      firstName: "Pat",
      lastName: "Test",
      email: `pat-${Date.now()}@test.com`,
      passwordHash,
      role: UserRole.PATIENT,
      companyId: company._id,
      active: true,
    });
    const customer = await Customer.create({
      companyId: company._id,
      pharmacyIds: [pharmacy._id],
      userId: patient._id,
      firstName: "Pat",
      lastName: "Test",
      phone: "555",
    });
    customerId = String(customer._id);

    const driver = await User.create({
      firstName: "Drv",
      lastName: "Test",
      email: `drv-${Date.now()}@test.com`,
      passwordHash,
      role: UserRole.DRIVER,
      companyId: company._id,
      active: true,
      onboardingStatus: "APPROVED",
      serviceZones: [
        { zoneId: "z", name: "Z", centerLat: 43.65, centerLng: -79.38, radiusKm: 50 },
      ],
    });
    pharmacy.linkedDriverIds = [driver._id];
    await pharmacy.save();

    const pharmUser = await User.create({
      firstName: "Ph",
      lastName: "Admin",
      email: `ph-${Date.now()}@test.com`,
      passwordHash,
      role: UserRole.PHARMACY_ADMIN,
      companyId: company._id,
      pharmacyId: pharmacy._id,
      active: true,
    });

    await Order.create({
      referenceNumber: `JD-AUTH-${Date.now()}`,
      companyId: company._id,
      pharmacyId: pharmacy._id,
      customerId: customer._id,
      status: OrderStatus.ON_THE_WAY,
      deliveryDate: new Date(),
      pickupAddress: pharmacy.address,
      pickupCoordinates: { latitude: 43.65, longitude: -79.38 },
      deliveryAddress: "2 St",
      deliveryCoordinates: { latitude: 43.66, longitude: -79.39 },
      assignedDriverId: driver._id,
      packageCount: 1,
    });

    patientToken = await login(patient.email);
    driverToken = await login(driver.email);
    pharmacyToken = await login(pharmUser.email);
  });

  it("rejects invalid login", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@test.com", password: "wrongpass" });
    expect(res.status).toBe(401);
  });

  it("returns current user from /auth/me", async () => {
    const res = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${patientToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe(UserRole.PATIENT);
  });

  it("rotates refresh token", async () => {
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: (await User.findOne({ role: UserRole.PATIENT }).sort({ createdAt: -1 }))!.email, password });
    const refresh = loginRes.body.data.refreshToken as string;
    const res = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: refresh });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it("patient only sees own orders", async () => {
    const res = await request(app)
      .get("/api/v1/orders")
      .set("Authorization", `Bearer ${patientToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("driver only sees assigned orders on list", async () => {
    const res = await request(app)
      .get("/api/v1/orders?status=ON_THE_WAY")
      .set("Authorization", `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it("patient pharmacies require location", async () => {
    const empty = await request(app)
      .get("/api/v1/pharmacies?activeOnly=true")
      .set("Authorization", `Bearer ${patientToken}`);
    expect(empty.body.data).toEqual({ radiusKm: 50, items: [] });

    const withLoc = await request(app)
      .get("/api/v1/pharmacies?activeOnly=true&lat=43.65&lng=-79.38")
      .set("Authorization", `Bearer ${patientToken}`);
    expect(withLoc.body.data.items?.length ?? withLoc.body.data.length).toBe(1);
  });

  it("patient can load /customers/me", async () => {
    const res = await request(app)
      .get("/api/v1/customers/me")
      .set("Authorization", `Bearer ${patientToken}`);
    expect(res.status).toBe(200);
    expect(String(res.body.data._id)).toBe(customerId);
  });

  it("pharmacy user can list pharmacy orders", async () => {
    const res = await request(app)
      .get("/api/v1/orders")
      .set("Authorization", `Bearer ${pharmacyToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("logout revokes refresh", async () => {
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: (await User.findOne({ role: UserRole.PATIENT }).sort({ createdAt: -1 }))!.email,
        password,
      });
    const access = loginRes.body.data.accessToken as string;
    const refresh = loginRes.body.data.refreshToken as string;
    await request(app).post("/api/v1/auth/logout").set("Authorization", `Bearer ${access}`);
    const res = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: refresh });
    expect(res.status).toBe(401);
  });
});
