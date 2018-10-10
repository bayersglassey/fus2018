

#include "includes.h"


const char *fus_err_code_msg(fus_err_code_t code){
    static const char *codes[FUS_ERRS] = {
        "Wrong type",
        "Overflow",
        "Underflow"
    };
    if(code < 0 || code >= FUS_ERRS)return "Unknown";
    return codes[code];
}



fus_value_t fus_err(fus_vm_t *vm, fus_err_code_t code){
#if FUS_PRINT_ERRS_TO_STDERR
    const char *msg = fus_err_code_msg(code);
    fprintf(stderr, "{Fus err #%i: %s}", code, msg);
#endif
#if FUS_USE_CURRENT_ERR_CODE
    fus_current_err_code = code;
#endif
#if FUS_ABORT_ON_ERR
    abort();
#endif
    return FUS_VALUE_ERR;
}


fus_value_t fus_sym(fus_vm_t *vm, fus_sym_i_t sym_i){
    fus_value_t value = FUS_BUILD(FUS_TAG_SYM, sym_i);
    return value;
}

fus_sym_i_t fus_sym_decode(fus_value_t value){
    if(FUS_GET_TAG(value) != FUS_TAG_SYM){
#if FUS_PRINT_ERRS_TO_STDERR
        fprintf(stderr, "{Fus error: %li is not a sym}", value.i);
#endif
#if FUS_ABORT_ON_ERR
        abort();
#endif
        return 0;
    }
    return FUS_GET_PAYLOAD(value);
}


fus_value_t fus_int(fus_vm_t *vm, fus_int_t i){
    fus_value_t value = FUS_BUILD(FUS_TAG_INT, i);
    if(FUS_GET_PAYLOAD(value) != i){
        /* If i is too big (if it uses either of the first 2 bits),
        we would lose precision when building the fus value. */
        return fus_err(vm, FUS_ERR_OVERFLOW);
    }
    return value;
}

fus_int_t fus_int_decode(fus_value_t value){
    if(FUS_GET_TAG(value) != FUS_TAG_INT){
#if FUS_PRINT_ERRS_TO_STDERR
        fprintf(stderr, "{Fus error: %li is not an int}", value.i);
#endif
#if FUS_ABORT_ON_ERR
        abort();
#endif
        return 0;
    }
    return FUS_GET_PAYLOAD(value);
}



fus_value_t fus_bool(fus_vm_t *vm, bool b){
    return b? FUS_VALUE_TRUE: FUS_VALUE_FALSE;
}

bool fus_bool_decode(fus_value_t value){
    return value.i == FUS_VALUE_TRUE.i;
}

fus_value_t fus_eq(fus_vm_t *vm,
    fus_value_t value_x, fus_value_t value_y
){
    fus_tag_t tag_x = FUS_GET_TAG(value_x);
    fus_tag_t tag_y = FUS_GET_TAG(value_y);
    if(tag_x != tag_y)return FUS_VALUE_FALSE;

    if(tag_x == FUS_TAG_COLLECTION)return fus_err(vm, FUS_ERR_WRONG_TYPE);
        /* Can't compare arr, obj, str, fun.
        TODO: It should be possible to compare everything except fun */

    return fus_bool(vm, value_x.i == value_y.i);
}




/*******************
 * FUS_CLASS STUFF *
 *******************/

void fus_class_init_value(fus_class_t *class, void *ptr){
    fus_value_t *value_ptr = ptr;
    value_ptr->i = FUS_VALUE_ERR.i;
}

void fus_class_cleanup_value(fus_class_t *class, void *ptr){
    fus_value_t *value_ptr = ptr;
    fus_value_t value = *value_ptr;
    fus_tag_t tag = FUS_GET_TAG(value);
    if(tag == FUS_TAG_COLLECTION)fus_collection_cleanup(value.c);
}


