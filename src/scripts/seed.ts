import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { env } from "../config/env.js";
import { connectPrimaryDatabase } from "../database/mongoConnect.js";
import { Company } from "../models/Company.js";
import { User } from "../models/User.js";
import { Pharmacy } from "../models/Pharmacy.js";
import { PharmacyRatePlan } from "../models/PharmacyRatePlan.js";
import { Customer } from "../models/Customer.js";
import { Order } from "../models/Order.js";
import { DriverShift } from "../models/DriverShift.js";
import { Notification } from "../models/Notification.js";
import { PaymentReconciliation } from "../models/PaymentReconciliation.js";
import {
  UserRole,
  OrderStatus,
  DriverOnboardingStatus,
  DispatchMode,
} from "../types/enums.js";

const pwd = env.SEED_PASSWORD ?? "ChangeMeDev123!";

async function seed() {
  await connectPrimaryDatabase();
  const passwordHash = await bcrypt.hash(pwd, 12);

  let company = await Company.findOne({ code: "JDA" });
  if (!company) {
    company = await Company.create({
      name: "Just Delivery Logistics",
      code: "JDA",
      settings: {
        claimWindowHoursBefore: 24,
        driverScheduleVisibilityDays: 7,
        gpsStaleThresholdMinutes: 5,
      },
    });
  }

  const upsertUser = async (email: string, data: Record<string, unknown>) => {
    const existing = await User.findOne({ email });
    if (existing) return existing;
    return User.create({ email, passwordHash, ...data });
  };

  const admin = await upsertUser("admin@justdelivery.local", {
    firstName: "Company",
    lastName: "Admin",
    role: UserRole.COMPANY_ADMIN,
    companyId: company._id,
    active: true,
  });
  await upsertUser("dispatcher@justdelivery.local", {
    firstName: "Dispatch",
    lastName: "Lead",
    role: UserRole.DISPATCHER,
    companyId: company._id,
    active: true,
  });
  await upsertUser("finance@justdelivery.local", {
    firstName: "Finance",
    lastName: "User",
    role: UserRole.FINANCE,
    companyId: company._id,
    active: true,
  });

  const zone = {
    zoneId: "gta-core",
    name: "Greater Toronto Core",
    centerLat: 43.6532,
    centerLng: -79.3832,
    radiusKm: 25,
  };

  const pharmacies = [];
  for (const [code, name, color] of [
    ["RX-NORTH", "Northside Pharmacy", "#06B6D4"],
    ["RX-EAST", "Eastview Pharmacy", "#8B5CF6"],
  ] as const) {
    let ph = await Pharmacy.findOne({ code });
    if (!ph) {
      const plan = await PharmacyRatePlan.create({
        pharmacyId: new mongoose.Types.ObjectId(),
        name: `${name} Standard`,
        effectiveFrom: new Date(),
        active: true,
      });
      ph = await Pharmacy.create({
        companyId: company._id,
        name,
        code,
        displayColor: color,
        secondaryColor: "#0B1528",
        email: `${code.toLowerCase()}@pharmacy.local`,
        phone: "416-555-0100",
        address: "100 Queen St W, Toronto",
        latitude: 43.6532,
        longitude: -79.3832,
        serviceZones: [zone],
        dispatchMode: DispatchMode.HYBRID,
        ratePlanId: plan._id,
        active: true,
      });
      plan.pharmacyId = ph._id;
      await plan.save();
    }
    pharmacies.push(ph);
  }

  const drivers = [];
  for (const [email, lat] of [
    ["driver1@justdelivery.local", 43.7],
    ["driver2@justdelivery.local", 43.64],
    ["driver3@justdelivery.local", 43.62],
  ] as const) {
    const d = await upsertUser(email, {
      firstName: email.split("@")[0]!,
      lastName: "Approved",
      role: UserRole.DRIVER,
      companyId: company._id,
      active: true,
      onboardingStatus: DriverOnboardingStatus.APPROVED,
      driverStatus: "AVAILABLE",
      vehicleType: "Car",
      licensePlate: `JDA-${lat}`,
      serviceZones: [{ ...zone, centerLat: lat }],
      weeklyAvailability: [
        { dayOfWeek: 1, start: "09:00", end: "17:00" },
        { dayOfWeek: 2, start: "09:00", end: "17:00" },
      ],
    });
    drivers.push(d);
  }

  for (const ph of pharmacies) {
    ph.linkedDriverIds = drivers.map((d) => d._id);
    await ph.save();
    await upsertUser(`admin@${ph.code.toLowerCase()}.local`, {
      firstName: "Pharmacy",
      lastName: "Admin",
      role: UserRole.PHARMACY_ADMIN,
      companyId: company._id,
      pharmacyId: ph._id,
      active: true,
    });
  }

  const patients = [];
  for (const email of ["patient1@justdelivery.local", "patient2@justdelivery.local"]) {
    const p = await upsertUser(email, {
      firstName: "Patient",
      lastName: email.includes("1") ? "One" : "Two",
      role: UserRole.PATIENT,
      companyId: company._id,
      active: true,
    });
    patients.push(p);
  }

  const customers = [];
  for (const p of patients) {
    let c = await Customer.findOne({ userId: p._id });
    if (!c) {
      c = await Customer.create({
        companyId: company._id,
        pharmacyIds: pharmacies.map((ph) => ph._id),
        userId: p._id,
        firstName: p.firstName,
        lastName: p.lastName,
        phone: "416-555-9999",
        email: p.email,
        addresses: [
          {
            label: "Home",
            line1: "55 Bloor St",
            city: "Toronto",
            province: "ON",
            postalCode: "M4W1A6",
            latitude: 43.67,
            longitude: -79.39,
          },
        ],
      });
    }
    customers.push(c);
  }

  const orderCount = await Order.countDocuments({ companyId: company._id });
  if (orderCount < 5) {
    const statuses = [
      OrderStatus.ACTION_REQUIRED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.ON_THE_WAY,
      OrderStatus.RETURNING,
      OrderStatus.COMPLETED,
    ];
    for (let day = 0; day < 7; day++) {
      for (let i = 0; i < 2; i++) {
        const ph = pharmacies[i % 2]!;
        const cust = customers[i % 2]!;
        const status = statuses[(day + i) % statuses.length]!;
        const deliveryDate = new Date();
        deliveryDate.setDate(deliveryDate.getDate() + day);
        await Order.create({
          referenceNumber: `JD-SEED-${day}-${i}`,
          companyId: company._id,
          pharmacyId: ph._id,
          customerId: cust._id,
          status,
          deliveryDate,
          timeWindowStart: "10:00",
          timeWindowEnd: "14:00",
          priority: i === 0 ? "NORMAL" : "URGENT",
          amountDue: 25,
          pickupAddress: ph.address,
          pickupCoordinates: { latitude: ph.latitude, longitude: ph.longitude },
          deliveryAddress: "55 Bloor St, Toronto",
          deliveryCoordinates: { latitude: 43.67, longitude: -79.39 },
          packageCount: 1,
          assignedDriverId: status === OrderStatus.ON_THE_WAY ? drivers[0]!._id : undefined,
          claimedAt: status === OrderStatus.ON_THE_WAY ? new Date() : undefined,
          statusTimestamps: { [status]: new Date() },
        });
      }
    }
  }

  await DriverShift.findOneAndUpdate(
    { driverId: drivers[0]!._id, scheduledDate: new Date() },
    {
      companyId: company._id,
      scheduledStart: "09:00",
      scheduledEnd: "17:00",
      status: "ACTIVE",
      actualStart: new Date(),
    },
    { upsert: true },
  );

  await Notification.findOneAndUpdate(
    { userId: admin._id, title: "Welcome" },
    {
      body: "Delivery App seed data loaded.",
      type: "SYSTEM",
      read: false,
    },
    { upsert: true },
  );

  const readyOrder = await Order.findOne({ status: OrderStatus.READY });
  if (readyOrder) {
    await PaymentReconciliation.findOneAndUpdate(
      { orderId: readyOrder._id },
      {
        companyId: company._id,
        driverId: drivers[0]!._id,
        expectedAmount: 25,
        submittedAmount: 25,
        difference: 0,
        financeStatus: "APPROVED",
      },
      { upsert: true },
    );
  }

  console.log("Seed complete. Password:", pwd);
  console.log("Logins: admin@justdelivery.local, dispatcher@justdelivery.local, driver1@justdelivery.local, patient1@justdelivery.local");
  await mongoose.disconnect();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
