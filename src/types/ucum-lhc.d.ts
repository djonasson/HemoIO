/** The parts of @lhncbc/ucum-lhc (which ships no types) that HemoIO uses */
declare module '@lhncbc/ucum-lhc' {
  export interface UcumUnit {
    dim_: { dimVec_: number[] } | null;
    isArbitrary_: boolean;
    moleExp_: number;
    equivalentExp_: number;
  }

  export interface UcumSpecifiedUnit {
    status: string;
    unit?: UcumUnit | null;
  }

  export interface UcumConversion {
    status: string;
    toVal: number | null;
  }

  export interface UcumConversionOptions {
    /** g/mol: needed to convert a mass to moles */
    molecularWeight?: number | null;
    /** The ion's charge: needed to convert moles or a mass to equivalents */
    charge?: number | null;
  }

  export class UcumLhcUtils {
    static getInstance(): UcumLhcUtils;
    getSpecifiedUnit(unit: string, valConv: string): UcumSpecifiedUnit;
    convertUnitTo(from: string, value: number, to: string, options?: UcumConversionOptions): UcumConversion;
  }
}
