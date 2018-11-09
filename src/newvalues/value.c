

#include "includes.h"


const char *fus_value_type_msg(fus_value_t value){
    if(fus_value_is_int(value))return "int";
    else if(fus_value_is_sym(value))return "sym";
    else if(fus_value_is_null(value))return "null";
    else if(fus_value_is_bool(value))return "bool";
    else if(fus_value_is_arr(value))return "arr";
    else if(fus_value_is_str(value))return "str";
    else if(fus_value_is_obj(value))return "obj";
    else if(fus_value_is_fun(value))return "fun";
    else return "unknown";
}

const char *fus_err_code_msg(fus_err_code_t code){
    static const char *codes[FUS_ERRS] = {
        "Wrong type",
        "Overflow",
        "Underflow",
        "Out of Bounds",
        "Can't Parse",
        "Missing key",
        "Lol Idunno"
    };
    if(code < 0 || code >= FUS_ERRS)return "Unknown";
    return codes[code];
}



fus_value_t fus_value_err(fus_vm_t *vm, fus_err_code_t code){
#if FUS_PRINT_ERRS_TO_STDERR
    const char *msg = fus_err_code_msg(code);
    fprintf(stderr, "{Fus err #%i: %s}", code, msg);
#if FUS_PRINT_BACKTRACE_WITH_ERRS
    fprintf(stderr, "\n"); FUS_BACKTRACE
#endif
#endif
#if FUS_USE_CURRENT_ERR_CODE
    fus_current_err_code = code;
#endif
#if FUS_EXIT_ON_ERR
    fus_exit(vm->core, EXIT_FAILURE);
#endif
    return FUS_VALUE_ERR;
}


fus_value_t fus_value_sym(fus_vm_t *vm, int sym_i){
    if(sym_i > FUS_PAYLOAD_MAX)return fus_value_err(vm, FUS_ERR_OVERFLOW);
    if(sym_i < FUS_PAYLOAD_MIN)return fus_value_err(vm, FUS_ERR_UNDERFLOW);
    fus_value_t value = (fus_value_t)(fus_unboxed_t)FUS_ADD_TAG(FUS_TAG_SYM, sym_i);
    return value;
}

int fus_value_sym_decode(fus_value_t value){
    if(!FUS_IS_SYM(value)){
#if FUS_PRINT_ERRS_TO_STDERR
        fprintf(stderr, "{Fus error: %li is not a sym}", value.i);
#endif
        return 0;
    }
    return FUS_GET_PAYLOAD(value.i);
}


fus_value_t fus_value_int(fus_vm_t *vm, fus_unboxed_t i){
    if(i > FUS_PAYLOAD_MAX)return fus_value_err(vm, FUS_ERR_OVERFLOW);
    if(i < FUS_PAYLOAD_MIN)return fus_value_err(vm, FUS_ERR_UNDERFLOW);
    fus_value_t value = (fus_value_t)FUS_ADD_TAG(FUS_TAG_INT, i);
    return value;
}

fus_unboxed_t fus_value_int_decode(fus_value_t value){
    if(!FUS_IS_INT(value)){
#if FUS_PRINT_ERRS_TO_STDERR
        fprintf(stderr, "{Fus error: %li is not an int}", value.i);
#endif
        return 0;
    }
    return FUS_GET_PAYLOAD(value.i);
}



fus_value_t fus_value_null(fus_vm_t *vm){
    return FUS_VALUE_NULL;
}

fus_value_t fus_value_bool(fus_vm_t *vm, bool b){
    return b? FUS_VALUE_TRUE: FUS_VALUE_FALSE;
}

fus_value_t fus_value_bool_not(fus_vm_t *vm, fus_value_t value_x){
    if(!FUS_IS_BOOL(value_x))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    bool b = fus_value_bool_decode(value_x);
    return fus_value_bool(vm, !b);
}

bool fus_value_bool_decode(fus_value_t value){
    return value.i == FUS_VALUE_TRUE.i;
}

fus_value_t fus_value_eq(fus_vm_t *vm,
    fus_value_t value_x, fus_value_t value_y
){
    fus_unboxed_t tag_x = FUS_GET_TAG(value_x.i);
    fus_unboxed_t tag_y = FUS_GET_TAG(value_y.i);
    if(tag_x != tag_y)return FUS_VALUE_FALSE;

    if(tag_x == FUS_TAG_BOXED){
        if(fus_value_is_str(value_x)){
            return fus_value_str_eq(vm, value_x, value_y);
        }
        return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
        /* Can't compare arr, obj, fun.
        TODO: It should be possible to compare everything except fun */
    }

    return fus_value_bool(vm, value_x.i == value_y.i);
}



void fus_value_attach(fus_vm_t *vm, fus_value_t value){
    fus_unboxed_t tag = FUS_GET_TAG(value.i);
    if(tag == FUS_TAG_BOXED && value.p != NULL){
        fus_boxed_attach(value.p);
    }
}

void fus_value_detach(fus_vm_t *vm, fus_value_t value){
    fus_unboxed_t tag = FUS_GET_TAG(value.i);
    if(tag == FUS_TAG_BOXED && value.p != NULL){
        fus_boxed_detach(value.p);
    }
}


bool fus_value_is_int(fus_value_t value){return FUS_IS_INT(value);}
bool fus_value_is_sym(fus_value_t value){return FUS_IS_SYM(value);}
bool fus_value_is_null(fus_value_t value){return FUS_IS_NULL(value);}
bool fus_value_is_true(fus_value_t value){return FUS_IS_TRUE(value);}
bool fus_value_is_false(fus_value_t value){return FUS_IS_FALSE(value);}
bool fus_value_is_bool(fus_value_t value){return FUS_IS_BOOL(value);}
bool fus_value_is_err(fus_value_t value){return FUS_IS_ERR(value);}
bool fus_value_is_arr(fus_value_t value){
    return FUS_IS_BOXED(value) && value.p->type == FUS_BOXED_ARR;
}
bool fus_value_is_str(fus_value_t value){
    return FUS_IS_BOXED(value) && value.p->type == FUS_BOXED_STR;
}
bool fus_value_is_obj(fus_value_t value){
    return FUS_IS_BOXED(value) && value.p->type == FUS_BOXED_OBJ;
}
bool fus_value_is_fun(fus_value_t value){
    return FUS_IS_BOXED(value) && value.p->type == FUS_BOXED_FUN;
}


void fus_value_fprint(fus_vm_t *vm, fus_value_t value, FILE *file){
    fus_printer_t printer;
    fus_printer_init(&printer);
    fus_printer_set_file(&printer, file);
    fus_printer_print_value(&printer, vm, value);
    fus_printer_cleanup(&printer);
}

void fus_value_print(fus_vm_t *vm, fus_value_t value){
    fus_value_fprint(vm, value, stdout);
}


/*******************
 * FUS_CLASS STUFF *
 *******************/

void fus_class_init_value(fus_class_t *class, void *ptr){
    fus_value_t *value_ptr = ptr;
    *value_ptr = FUS_VALUE_ERR;
}

void fus_class_cleanup_value(fus_class_t *class, void *ptr){
    fus_vm_t *vm = class->data;
    fus_value_t *value_ptr = ptr;
    fus_value_detach(vm, *value_ptr);
}

