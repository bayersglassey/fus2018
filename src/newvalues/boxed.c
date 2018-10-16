

#include "includes.h"



#define FUS_BOXED_LOG_WEIRD_TYPE(type) \
    fprintf(stderr, "%s: Got weird boxed type: %i\n", __func__, type);

const char *fus_boxed_type_msg(fus_boxed_type_t type){
    static const char *types[FUS_BOXEDS] = {
        "arr",
        "obj",
        "str",
        "fun"
    };
    if(type < 0 || type >= FUS_BOXEDS)return "Unknown";
    return types[type];
}

void fus_boxed_dump(fus_boxed_t *p, FILE *file){
    fprintf(file, "address=%p, type=%s, refcount=%i\n",
        p, fus_boxed_type_msg(p->type), p->refcount);
}

void fus_boxed_init(fus_boxed_t *p, fus_vm_t *vm,
    fus_boxed_type_t type
){
    if(p == NULL)return;
    p->vm = vm;
    p->type = type;
    p->refcount = 1;
    vm->n_boxed++;
    /*
    if(type == FUS_BOXED_ARR){
        fus_arr_t *a = &p->data.a;
        fus_array_init(&a->values, &vm->class_value);
    }else if(type == FUS_BOXED_OBJ){
        fus_obj_t *o = &p->data.o;
        fus_array_init(&o->keys, &vm->class_sym_i);
        fus_array_init(&o->values, &vm->class_value);
    }else if(type == FUS_BOXED_STR){
        fus_str_t *s = &p->data.s;
        fus_array_init(&s->text, &vm->class_char);
    }else if(type == FUS_BOXED_FUN){
        // TODO...
    }else{
        FUS_BOXED_LOG_WEIRD_TYPE(type)
    }
    */
}

void fus_boxed_cleanup(fus_boxed_t *p){
    if(p == NULL)return;
    if(p->refcount != 0){
        fprintf(stderr, "%s: WARNING: "
            "Cleanup of value with nonzero refcount: ", __func__);
        fus_boxed_dump(p, stderr);
        fflush(stderr);
    }
    fus_boxed_type_t type = p->type;
    p->vm->n_boxed--;
    if(type == FUS_BOXED_ARR){
        fus_arr_t *a = &p->data.a;
        fus_array_cleanup(&a->values);
    }else if(type == FUS_BOXED_OBJ){
        fus_obj_t *o = &p->data.o;
        fus_array_cleanup(&o->keys);
        fus_array_cleanup(&o->values);
    }else if(type == FUS_BOXED_STR){
        fus_str_t *s = &p->data.s;
        fus_array_cleanup(&s->text);
    }else if(type == FUS_BOXED_FUN){
        /* TODO... */
    }else{
        FUS_BOXED_LOG_WEIRD_TYPE(type)
    }
    fus_free(p->vm->core, p);
}

void fus_boxed_attach(fus_boxed_t *p){
    p->refcount++;
}

void fus_boxed_detach(fus_boxed_t *p){
    p->refcount--;
    if(p->refcount <= 0){
        if(p->refcount < 0){
            fprintf(stderr, "%s: WARNING: "
                "Boxed value's refcount has gone negative: ",
                __func__);
            fus_boxed_dump(p, stderr);
            fflush(stderr);
        }
        fus_boxed_cleanup(p);
    }
}



/*******
 * ARR *
 *******/

void fus_arr_init(fus_arr_t *a, fus_vm_t *vm){
    fus_array_init(&a->values, &vm->class_value);
}

void fus_arr_cleanup(fus_arr_t *a){
    fus_array_cleanup(&a->values);
}

bool fus_is_arr(fus_value_t value){
    return FUS_IS_UNBOXED(value) && value.p->type == FUS_BOXED_ARR;
}

fus_value_t fus_arr(fus_vm_t *vm){
    /* Creates a new, empty arr value. */
    fus_boxed_t *p = fus_malloc(vm->core, sizeof(*p));
    fus_boxed_init(p, vm, FUS_BOXED_ARR);
    fus_arr_init(&p->data.a, vm);
    return (fus_value_t)p;
}

void fus_arr_mkunique(fus_boxed_t **p_ptr){
    /* Guarantees that p will have refcount 1.
    Either leaves p alone if it already has refcount 1,
    or "splits" p into two copies, with refcounts
    old_refcount-1 and 1, and returning the copy with
    refcount 1. */

    fus_boxed_t *p = *p_ptr;
    if(p->refcount > 1){
        fus_boxed_detach(p);
        fus_boxed_t *new_p = fus_arr(p->vm).p;
        fus_array_copy(&new_p->data.a.values, &p->data.a.values);
        *p_ptr = new_p;
    }
}

fus_value_t fus_arr_len(fus_vm_t *vm, fus_value_t value){
    /* Return len of arr value as a new int value */
    if(!fus_is_arr(value))return fus_err(vm, FUS_ERR_WRONG_TYPE);
    return fus_int(vm, value.p->data.a.values.len);
}

void fus_arr_push(fus_vm_t *vm, fus_value_t *value1_ptr,
    fus_value_t value2
){
    /* Refcounts of value1 and value2 are unchanged
    (Except in case of error, when they are both decremented) */

    /* Typecheck */
    fus_value_t value1 = *value1_ptr;
    if(!fus_is_arr(value1)){
        fus_value_detach(value1);
        fus_value_detach(value2);
        *value1_ptr = fus_err(vm, FUS_ERR_WRONG_TYPE);
        return;
    }

    /* Uniqueness guarantee */
    fus_arr_mkunique(&value1.p);

    /* Get arr and resize its array */
    fus_arr_t *a = &value1.p->data.a;
    fus_array_len_t new_len = a->values.len + 1;
    fus_array_set_len(&a->values, new_len);

    /* Poke value2 into last array element */
    fus_value_t *values = (fus_value_t*)&a->values.elems;

    /* Return */
    *value1_ptr = value1;
}

