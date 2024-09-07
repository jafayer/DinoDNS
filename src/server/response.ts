import { Packet } from "../dns/dnslib";
import { requestFromMessage } from "./request";
import dgram from 'dgram';
import { EventEmitter } from "events";

