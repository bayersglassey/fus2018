

#include "includes.h"



fus_value_t fus_value_int_add(fus_vm_t *vm,
    fus_value_t value_x, fus_value_t value_y
){
    if(!FUS_IS_INT(value_x))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    if(!FUS_IS_INT(value_y))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    fus_unboxed_t x = FUS_GET_PAYLOAD(value_x.i);
    fus_unboxed_t y = FUS_GET_PAYLOAD(value_y.i);

    /* overflow/underflow checks */
    /* Taken from https://stackoverflow.com/a/1514309 */
    if((x > 0) && (y > FUS_PAYLOAD_MAX - x))return fus_value_err(vm, FUS_ERR_OVERFLOW);
    if((x < 0) && (y < FUS_PAYLOAD_MIN - x))return fus_value_err(vm, FUS_ERR_UNDERFLOW);

    fus_unboxed_t z = x + y;
    return fus_value_int(vm, z);
}

fus_value_t fus_value_int_sub(fus_vm_t *vm,
    fus_value_t value_x, fus_value_t value_y
){
    if(!FUS_IS_INT(value_x))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    if(!FUS_IS_INT(value_y))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    fus_unboxed_t x = FUS_GET_PAYLOAD(value_x.i);
    fus_unboxed_t y = FUS_GET_PAYLOAD(value_y.i);

    /* overflow/underflow checks */
    /* Taken from https://stackoverflow.com/a/1514309 */
    if((x < 0) && (y > FUS_PAYLOAD_MAX + x))return fus_value_err(vm, FUS_ERR_OVERFLOW);
    if((x > 0) && (y < FUS_PAYLOAD_MIN + x))return fus_value_err(vm, FUS_ERR_UNDERFLOW);

    fus_unboxed_t z = x - y;
    return fus_value_int(vm, z);
}

fus_value_t fus_value_int_mul(fus_vm_t *vm,
    fus_value_t value_x, fus_value_t value_y
){
    if(!FUS_IS_INT(value_x))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    if(!FUS_IS_INT(value_y))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    fus_unboxed_t x = FUS_GET_PAYLOAD(value_x.i);
    fus_unboxed_t y = FUS_GET_PAYLOAD(value_y.i);

    /* overflow/underflow checks */
    /* Taken from https://stackoverflow.com/a/1514309 */
    if(y > FUS_PAYLOAD_MAX / x)return fus_value_err(vm, FUS_ERR_OVERFLOW);
    if(y < FUS_PAYLOAD_MIN / x)return fus_value_err(vm, FUS_ERR_UNDERFLOW);
    /* The following checks are apparently only necessary on two's compliment machines */
    if((x == -1) && (y == FUS_PAYLOAD_MIN))return fus_value_err(vm, FUS_ERR_OVERFLOW);
    if((y == -1) && (x == FUS_PAYLOAD_MIN))return fus_value_err(vm, FUS_ERR_OVERFLOW);

    fus_unboxed_t z = x * y;
    return fus_value_int(vm, z);
}

