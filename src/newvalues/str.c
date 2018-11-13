

#include "includes.h"



void fus_str_init(fus_vm_t *vm, fus_str_t *s,
    char *text, int len, size_t size
){
    s->text = text;
    s->len = len;
    s->size = size;
}

void fus_str_cleanup(fus_vm_t *vm, fus_str_t *s){
    /* NOTE: If text != NULL && size == 0, then str doesn't own its text
    (e.g. text was a C string literal) */
    if(s->size != 0)free(s->text);
}


int fus_str_len(fus_vm_t *vm, fus_str_t *s){
    return s->len;
}

bool fus_str_eq(fus_vm_t *vm, fus_str_t *s1, fus_str_t *s2){
    return s1->len == s2->len && !strncmp(s1->text, s2->text, s1->len);
}

void fus_str_join(fus_vm_t *vm, fus_str_t *s1, fus_str_t *s2){
    int new_len = s1->len + s2->len;
    size_t new_size = s1->size;

    if(new_size < new_len + 1){
        /* Grow array */
        new_size = new_len + 1;
        s1->text = fus_realloc(vm->core, s1->text, new_size);
    }

    /* Copy s2->text onto end of s1->text */
    strncpy(s1->text + s1->len, s2->text, s2->len);

    /* NUL terminate */
    s1->text[new_len] = '\0';

    /* Update len, size */
    s1->len = new_len;
    s1->size = new_size;
}

void fus_str_slice(fus_vm_t *vm, fus_str_t *s, int i0, int len){
    if(s->len == 0)return;
    if(i0 < 0){i0 = 0; len += i0;}
    if(i0 + len >= s->len)len = s->len - i0;
    for(int i = 0; i < len; i++){
        s->text[i] = s->text[i0 + i];
    }
    s->text[len] = '\0';
    s->len = len;
}



void fus_boxed_str_mkunique(fus_boxed_t **p_ptr){
    /* Guarantees that p will have refcount 1.
    Either leaves p alone if it already has refcount 1,
    or "splits" p into two copies, with refcounts
    old_refcount-1 and 1, and returning the copy with
    refcount 1. */

    fus_boxed_t *p = *p_ptr;
    if(p->refcount > 1){
        fus_vm_t *vm = p->vm;
        fus_str_t *s = &p->data.s;

        char *new_text = fus_malloc(vm->core, s->size);
        fus_memcpy(vm->core, new_text, s->text, s->size);

        fus_boxed_detach(p);
        fus_boxed_t *new_p = fus_value_str(vm, new_text,
            s->len, s->size).p;
        *p_ptr = new_p;
    }
}


fus_value_t fus_value_str(fus_vm_t *vm,
    char *text, int len, size_t size
){
    /* Creates a new, empty str value. */
    fus_boxed_t *p = fus_malloc(vm->core, sizeof(*p));
    fus_boxed_init(p, vm, FUS_BOXED_STR);
    fus_str_init(vm, &p->data.s, text, len, size);
    return (fus_value_t)p;
}

fus_value_t fus_value_str_len(fus_vm_t *vm, fus_value_t value){
    /* Return len of str value as a new int value */
    if(!fus_value_is_str(value))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    return fus_value_int(vm, fus_str_len(vm, &value.p->data.s));
}

fus_value_t fus_value_str_eq(fus_vm_t *vm, fus_value_t value1,
    fus_value_t value2
){
    /* Return equality of str values as a new bool value */
    if(!fus_value_is_str(value1))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    if(!fus_value_is_str(value2))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    return fus_value_bool(vm, fus_str_eq(vm, &value1.p->data.s,
        &value2.p->data.s));
}

const char *fus_value_str_decode(fus_vm_t *vm, fus_value_t value){
    if(!fus_value_is_str(value)){
#if FUS_PRINT_ERRS_TO_STDERR
        fprintf(stderr, "{Fus error: %li is not a str}", value.i);
#endif
        return NULL;
    }
    return value.p->data.s.text;
}

void fus_value_str_join(fus_vm_t *vm, fus_value_t *value_s1_ptr,
    fus_value_t value_s2
){

    /* Typecheck */
    fus_value_t value_s1 = *value_s1_ptr;
    if(!fus_value_is_str(value_s1) || !fus_value_is_str(value_s2)){
        fus_value_detach(vm, value_s1);
        fus_value_detach(vm, value_s2);
        *value_s1_ptr = fus_value_err(vm, FUS_ERR_WRONG_TYPE);
        return;
    }

    /* Uniqueness guarantee */
    fus_boxed_str_mkunique(&value_s1.p);

    /* Get strs and do the join */
    fus_str_t *s1 = &value_s1.p->data.s;
    fus_str_t *s2 = &value_s2.p->data.s;
    fus_str_join(vm, s1, s2);

    /* Return */
    *value_s1_ptr = value_s1;
}

void fus_value_str_slice(fus_vm_t *vm, fus_value_t *value_s_ptr,
    fus_value_t value_i, fus_value_t value_len
){

    /* Typecheck */
    fus_value_t value_s = *value_s_ptr;
    if(!fus_value_is_str(value_s)){
        fus_value_detach(vm, value_s);
        fus_value_detach(vm, value_i);
        fus_value_detach(vm, value_len);
        *value_s_ptr = fus_value_err(vm, FUS_ERR_WRONG_TYPE);
        return;
    }

    /* Uniqueness guarantee */
    fus_boxed_str_mkunique(&value_s.p);

    /* Get str, i, len and do the slice */
    fus_str_t *s = &value_s.p->data.s;
    int i = fus_value_int_decode(vm, value_i);
    int len = fus_value_int_decode(vm, value_len);
    fus_str_slice(vm, s, i, len);

    /* Return */
    *value_s_ptr = value_s;
}

fus_value_t fus_value_str_getcode(fus_vm_t *vm, fus_value_t value_s,
    fus_value_t value_i
){
    /* Return ASCII (and eventually Unicode, one hopes) value at given
    index of str value as a new int value */
    if(!fus_value_is_str(value_s))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    int i = fus_value_int_decode(vm, value_i);
    fus_str_t *s = &value_s.p->data.s;
    if(i < 0 || i >= s->len)return fus_value_err(vm, FUS_ERR_OUT_OF_BOUNDS);
    char c = s->text[i];
    return fus_value_int(vm, c);
}

void fus_value_str_setcode(fus_vm_t *vm, fus_value_t *value_s_ptr,
    fus_value_t value_code, fus_value_t value_i
){
    /* Set ASCII (and eventually Unicode, one hopes) value at given
    index of str value */

    /* Typecheck */
    fus_value_t value_s = *value_s_ptr;
    if(!fus_value_is_str(value_s)){
        fus_value_detach(vm, value_s);
        fus_value_detach(vm, value_i);
        fus_value_detach(vm, value_code);
        *value_s_ptr = fus_value_err(vm, FUS_ERR_WRONG_TYPE);
        return;
    }

    /* Uniqueness guarantee */
    fus_boxed_str_mkunique(&value_s.p);

    /* Get str, i, c and set the code */
    int i = fus_value_int_decode(vm, value_i);
    fus_str_t *s = &value_s.p->data.s;
    if(i < 0 || i >= s->len){
        fus_value_detach(vm, value_s);
        fus_value_detach(vm, value_i);
        fus_value_detach(vm, value_code);
        *value_s_ptr = fus_value_err(vm, FUS_ERR_OUT_OF_BOUNDS);
        return;
    }
    int c = fus_value_int_decode(vm, value_code);
    if(c <= 0 || c > CHAR_MAX){
        fprintf(stderr, "%s: Can't interpret %i as a char. "
            "(One day, we will attempt to interpret it as a Unicode "
            "codepoint.\n", __func__, c);
        if(c == 0)fprintf(stderr, "...Do we allow NUL bytes in str???\n");
        *value_s_ptr = fus_value_err(vm, FUS_ERR_IDUNNO);
        return;
    }
    s->text[i] = c;

    /* Return */
    *value_s_ptr = value_s;
}


