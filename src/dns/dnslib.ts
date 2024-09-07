import type { DecodedPacket, Answer, StringRecordType } from "dns-packet";
import dnsPacket from 'dns-packet';

export class Packet {
    constructor(public packet: DecodedPacket) {}

    static fromBuffer(buffer: Buffer) {
        const packet = dnsPacket.decode(buffer);
        packet.additionals
        return new Packet(packet);
    }

    encode(): Buffer {
        return dnsPacket.encode(this.packet);
    }

    toJSON(): string {
        return JSON.stringify(this.packet);
    }

    responseFromQuestion() {
        return new Packet({
            type: "response",
            id: this.packet.id,
            flags: this.packet.flags,
            flag_aa: this.packet.flag_aa,
            flag_ad: this.packet.flag_ad,
            flag_cd: this.packet.flag_cd,
            flag_qr: this.packet.flag_qr,
            flag_ra: this.packet.flag_ra,
            flag_rd: this.packet.flag_rd,
            flag_tc: this.packet.flag_tc,
            flag_z: this.packet.flag_z,
            questions: this.packet.questions,
            answers: [],
            authorities: [],
            additionals: []
        });
    }

    get id() {
        return this.packet.id;
    }

    set id(id) {
        this.packet.id = id;
    }

    get type() {
        return this.packet.type;
    }

    set type(type) {
        this.packet.type = type;
    }

    get flags() {
        return this.packet.flags;
    }

    set flags(flags) {
        this.packet.flags = flags;
    }
    
    get questions() {
        return this.packet.questions;
    }

    set questions(questions) {
        this.packet.questions = questions;
    }

    get answers() {
        return this.packet.answers;
    }

    set answers(answers) {
        this.packet.answers = answers;
    }


    get authorities() {
        return this.packet.authorities;
    }

    set authorities(authorities) {
        this.packet.authorities = authorities;
    }


    get additionals() {
        return this.packet.additionals;
    }

    set additionals(additionals) {
        this.packet.additionals = additionals;
    }
}