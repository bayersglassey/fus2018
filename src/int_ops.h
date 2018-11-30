#ifndef _FUS_INT_OPS_H_
#define _FUS_INT_OPS_H_


/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */

fus_value_t fus_value_int_neg(fus_vm_t *vm, fus_value_t value_x);
fus_value_t fus_value_int_tostr(fus_vm_t *vm, fus_value_t value_x);

#define FUS_VALUE_INT_BINOP(OP) \
    fus_value_t fus_value_int_##OP(fus_vm_t *vm, \
        fus_value_t value_x, fus_value_t value_y)

FUS_VALUE_INT_BINOP(add);
FUS_VALUE_INT_BINOP(sub);
FUS_VALUE_INT_BINOP(mul);
FUS_VALUE_INT_BINOP(div);
FUS_VALUE_INT_BINOP(mod);
FUS_VALUE_INT_BINOP(eq);
FUS_VALUE_INT_BINOP(ne);
FUS_VALUE_INT_BINOP(lt);
FUS_VALUE_INT_BINOP(gt);
FUS_VALUE_INT_BINOP(le);
FUS_VALUE_INT_BINOP(ge);


#endif